package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const platformFeeRate = 0.035

type server struct {
	attemptsMu sync.Mutex
	attempts   map[string]*attemptWindow
}

type attemptWindow struct {
	count   int
	resetAt time.Time
}

type roleGateRequest struct {
	Role     string `json:"role"`
	Password string `json:"password"`
}

type registrationRequest struct {
	HospitalName string      `json:"hospitalName"`
	Address      string      `json:"address"`
	City         string      `json:"city"`
	HospitalType string      `json:"hospitalType"`
	Lat          interface{} `json:"lat"`
	Lng          interface{} `json:"lng"`
	Email        string      `json:"email"`
	Password     string      `json:"password"`
}

func main() {
	s := &server{attempts: make(map[string]*attemptWindow)}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.health)
	mux.HandleFunc("/api/healthz", s.health)
	mux.HandleFunc("/api/role-gate", s.roleGate)
	mux.HandleFunc("/api/register-hospital", s.registerHospital)
	mux.HandleFunc("/api/billing/summary", s.billingSummary)
	mux.HandleFunc("/api/billing/ledger", s.billingLedger)
	mux.HandleFunc("/api/billing/checkout-session", s.checkoutSession)

	addr := ":" + envOr("PORT", "5000")
	log.Printf("MedRebalance Go API listening on %s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "authorization, content-type, apikey")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) roleGate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var body roleGateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body."})
		return
	}
	passwordEnv := map[string]string{
		"pharmacist":    "ROLE_GATE_PHARMACIST_PASSWORD",
		"admin":         "ROLE_GATE_ADMIN_PASSWORD",
		"network_admin": "ROLE_GATE_NETWORK_ADMIN_PASSWORD",
	}
	envName, ok := passwordEnv[body.Role]
	if !ok || body.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Choose a valid role and enter its gate password."})
		return
	}
	configured := os.Getenv(envName)
	if configured == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "This role gate is not configured yet."})
		return
	}
	if body.Password != configured {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Incorrect gate password."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "role": body.Role})
}

func (s *server) registerHospital(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	if !s.allowRegistration(clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Too many registration attempts. Please wait 15 minutes and try again."})
		return
	}

	var body registrationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body."})
		return
	}
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	body.HospitalName = strings.TrimSpace(body.HospitalName)
	body.Address = strings.TrimSpace(body.Address)
	if body.HospitalName == "" || body.Address == "" || body.City == "" || body.HospitalType == "" || body.Email == "" || len(body.Password) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Please provide valid hospital details, email, coordinates, and a password of at least 6 characters."})
		return
	}
	lat, okLat := number(body.Lat)
	lng, okLng := number(body.Lng)
	if !okLat || !okLng {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Please provide valid hospital details, email, coordinates, and a password of at least 6 characters."})
		return
	}

	uid, err := supabaseCreateUser(body.Email, body.Password, body.HospitalName)
	if err != nil {
		status := http.StatusServiceUnavailable
		if strings.Contains(strings.ToLower(err.Error()), "already") || strings.Contains(strings.ToLower(err.Error()), "registered") || strings.Contains(strings.ToLower(err.Error()), "exists") {
			status = http.StatusBadRequest
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}

	hospitalID, err := supabaseCreateHospital(body.HospitalName, fmt.Sprintf("%s, %s", body.Address, body.City), lat, lng, body.HospitalType)
	if err != nil {
		_ = supabaseDeleteUser(uid)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
		return
	}
	if err := supabaseCreateMembership(uid, hospitalID, "admin"); err != nil {
		_ = supabaseDeleteUser(uid)
		_ = supabaseDeleteHospital(hospitalID)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "email": body.Email})
}

func (s *server) allowRegistration(ip string) bool {
	s.attemptsMu.Lock()
	defer s.attemptsMu.Unlock()
	now := time.Now()
	entry := s.attempts[ip]
	if entry == nil || !entry.resetAt.After(now) {
		s.attempts[ip] = &attemptWindow{count: 1, resetAt: now.Add(15 * time.Minute)}
		return true
	}
	if entry.count >= 5 {
		return false
	}
	entry.count++
	return true
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	return r.RemoteAddr
}

func number(value interface{}) (float64, bool) {
	switch n := value.(type) {
	case float64:
		return n, n == n
	case string:
		v, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return v, err == nil
	default:
		return 0, false
	}
}

func supabaseConfig() (string, string, error) {
	url := strings.TrimRight(strings.TrimSpace(envOr("SUPABASE_URL", os.Getenv("VITE_SUPABASE_URL"))), "/")
	key := strings.TrimSpace(os.Getenv("SUPABASE_SECRET_KEY"))
	if key == "" {
		key = strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	}
	if url == "" || key == "" {
		return "", "", fmt.Errorf("server is missing SUPABASE_URL or SUPABASE_SECRET_KEY")
	}
	return url, key, nil
}

func supabaseRequest(method, path string, body any) ([]byte, int, error) {
	base, key, err := supabaseConfig()
	if err != nil {
		return nil, 0, err
	}
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequest(method, base+path, reader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("apikey", key)
	if !strings.HasPrefix(key, "sb_secret_") {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

func supabaseCreateUser(email, password, hospitalName string) (string, error) {
	data, status, err := supabaseRequest(http.MethodPost, "/auth/v1/admin/users", map[string]any{
		"email": email, "password": password, "email_confirm": true,
		"user_metadata": map[string]string{"hospital_name": hospitalName},
	})
	if err != nil { return "", err }
	if status < 200 || status >= 300 { return "", supabaseError(data, status) }
	var result struct{ ID string `json:"id"` }
	if err := json.Unmarshal(data, &result); err != nil || result.ID == "" { return "", fmt.Errorf("Supabase did not return the new user id") }
	return result.ID, nil
}

func supabaseCreateHospital(name, address string, lat, lng float64, hospitalType string) (string, error) {
	data, status, err := supabaseRequest(http.MethodPost, "/rest/v1/hospitals", map[string]any{"name": name, "address": address, "lat": lat, "lng": lng, "type": hospitalType})
	if err != nil { return "", err }
	if status < 200 || status >= 300 { return "", supabaseError(data, status) }
	var result []struct{ ID string `json:"id"` }
	if err := json.Unmarshal(data, &result); err != nil || len(result) == 0 || result[0].ID == "" { return "", fmt.Errorf("hospital was created but Supabase did not return its id") }
	return result[0].ID, nil
}

func supabaseCreateMembership(uid, hospitalID, role string) error {
	data, status, err := supabaseRequest(http.MethodPost, "/rest/v1/hospital_users", map[string]any{"user_id": uid, "hospital_id": hospitalID, "role": role})
	if err != nil { return err }
	if status < 200 || status >= 300 { return supabaseError(data, status) }
	return nil
}

func supabaseDeleteUser(uid string) error { _, _, err := supabaseRequest(http.MethodDelete, "/auth/v1/admin/users/"+uid, nil); return err }
func supabaseDeleteHospital(id string) error { _, _, err := supabaseRequest(http.MethodDelete, "/rest/v1/hospitals?id=eq."+id, nil); return err }

func supabaseError(data []byte, status int) error {
	var body map[string]any
	if json.Unmarshal(data, &body) == nil {
		for _, key := range []string{"msg", "message", "error_description", "error"} {
			if value, ok := body[key].(string); ok && value != "" { return fmt.Errorf("%s", value) }
		}
	}
	return fmt.Errorf("Supabase request failed (%d)", status)
}

func stripeConfig() (string, error) {
	key := strings.TrimSpace(os.Getenv("STRIPE_SECRET_KEY"))
	if key == "" { return "", fmt.Errorf("Stripe billing is not configured.") }
	return key, nil
}

func stripeRequest(method, path string, form map[string]string) ([]byte, int, error) {
	key, err := stripeConfig()
	if err != nil { return nil, 0, err }
	var body io.Reader
	if form != nil {
		values := make([]string, 0, len(form)*2)
		for k, v := range form { values = append(values, k+"="+urlEscape(v)) }
		body = strings.NewReader(strings.Join(values, "&"))
	}
	req, err := http.NewRequest(method, "https://api.stripe.com/v1"+path, body)
	if err != nil { return nil, 0, err }
	req.SetBasicAuth(key, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil { return nil, 0, err }
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

func urlEscape(value string) string {
	var b strings.Builder
	const hex = "0123456789ABCDEF"
	for i := 0; i < len(value); i++ {
		c := value[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || strings.ContainsRune("-_.~", rune(c)) { b.WriteByte(c) } else { b.WriteByte('%'); b.WriteByte(hex[c>>4]); b.WriteByte(hex[c&15]) }
	}
	return b.String()
}

func (s *server) billingSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet { writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error":"method not allowed"}); return }
	data, status, err := stripeRequest(http.MethodGet, "/subscriptions?status=all&limit=100", nil)
	if err != nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":err.Error()}); return }
	if status < 200 || status >= 300 { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":"Stripe billing is temporarily unavailable."}); return }
	var subs struct{ Data []struct { Status string `json:"status"`; Items struct { Data []struct { Price struct { UnitAmount int64 `json:"unit_amount"`; Currency string `json:"currency"`; Recurring struct { Interval string `json:"interval"` } `json:"recurring"` } `json:"price"` } `json:"data"` } `json:"items"` } `json:"data"` }
	if err := json.Unmarshal(data, &subs); err != nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":"Unable to read Stripe subscriptions."}); return }
	monthly := int64(0); currency := "usd"; subscriptionStatus := "none"
	for _, sub := range subs.Data { if sub.Status == "active" || sub.Status == "trialing" || sub.Status == "past_due" { subscriptionStatus=sub.Status; if len(sub.Items.Data)>0 && sub.Items.Data[0].Price.Recurring.Interval=="month" { monthly=sub.Items.Data[0].Price.UnitAmount; currency=sub.Items.Data[0].Price.Currency }; break } }
	writeJSON(w, http.StatusOK, map[string]any{"subscriptionStatus":subscriptionStatus,"monthlySubscriptionAmount":monthly,"currency":currency,"platformFeeRate":platformFeeRate,"feesCollected":0,"completedTransfers":0,"lastSyncedAt":time.Now().UTC().Format(time.RFC3339)})
}

func (s *server) billingLedger(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet { writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error":"method not allowed"}); return }
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" { if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 100 { limit=n } }
	data, status, err := stripeRequest(http.MethodGet, "/payment_intents?limit="+strconv.Itoa(limit), nil)
	if err != nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":err.Error()}); return }
	if status < 200 || status >= 300 { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":"Stripe ledger is temporarily unavailable."}); return }
	var result struct{ Data []any `json:"data"` }
	if err := json.Unmarshal(data, &result); err != nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":"Unable to read Stripe ledger."}); return }
	writeJSON(w, http.StatusOK, []any{})
}

func (s *server) checkoutSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error":"method not allowed"}); return }
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error":"Invalid checkout request."}); return }
	priceID, _ := body["priceId"].(string)
	if priceID == "" { priceID = strings.TrimSpace(os.Getenv("STRIPE_PRICE_ID")) }
	customerEmail, _ := body["customerEmail"].(string)
	successURL, _ := body["successUrl"].(string); cancelURL, _ := body["cancelUrl"].(string)
	if priceID == "" || successURL == "" || cancelURL == "" { writeJSON(w, http.StatusBadRequest, map[string]string{"error":"Stripe checkout details are required."}); return }
	data, status, err := stripeRequest(http.MethodPost, "/checkout/sessions", map[string]string{"mode":"subscription","line_items[0][price]":priceID,"line_items[0][quantity":"1","customer_email":customerEmail,"success_url":successURL,"cancel_url":cancelURL})
	if err != nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":err.Error()}); return }
	if status < 200 || status >= 300 { writeJSON(w, status, map[string]string{"error":"Unable to create checkout session."}); return }
	var session struct { ID string `json:"id"`; URL string `json:"url"` }
	if err := json.Unmarshal(data, &session); err != nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error":"Unable to read checkout session."}); return }
	writeJSON(w, http.StatusOK, map[string]string{"url":session.URL,"sessionId":session.ID})
}

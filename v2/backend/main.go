package main

import (
	"context"
	_ "embed"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed schema.sql
var schemaSQL string

type App struct{ db *pgxpool.Pool }

type User struct {
	ID string `json:"id"`; Email string `json:"email"`; Name string `json:"name"`
	HospitalID string `json:"hospitalId"`; HospitalName string `json:"hospitalName"`; Role string `json:"role"`
}
type credentials struct{ Email string `json:"email"`; Password string `json:"password"` }
type registerRequest struct{ HospitalName string `json:"hospitalName"`; UserName string `json:"userName"`; Email string `json:"email"`; Password string `json:"password"` }
type inventoryItem struct{ ID string `json:"id"`; Medicine string `json:"medicine"`; Batch string `json:"batch"`; Expiry string `json:"expiry"`; Quantity int `json:"quantity"`; DailyRunRate int `json:"dailyRunRate"`; UnitCost float64 `json:"unitCost"`; Status string `json:"status"` }
type stockoutRequest struct{ Medicine string `json:"medicine"`; Quantity int `json:"quantity"`; Priority string `json:"priority"` }
type transferRequest struct{ Medicine string `json:"medicine"`; ToHospital string `json:"toHospital"`; Quantity int `json:"quantity"` }

func main() {
	port := env("PORT", "8080")
	var pool *pgxpool.Pool
	if dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL")); dbURL != "" {
		cfg, err := pgxpool.ParseConfig(dbURL); if err != nil { log.Fatal(err) }
		cfg.MaxConns, cfg.MinConns = 10, 1
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second); defer cancel()
		pool, err = pgxpool.NewWithConfig(ctx, cfg); if err != nil { log.Fatal(err) }
		if err := pool.Ping(ctx); err != nil { log.Fatal(err) }
		if _, err := pool.Exec(ctx, schemaSQL); err != nil { log.Fatal("database schema initialization failed: ", err) }
	} else { log.Println("DATABASE_URL not set; API is running without database access") }

	a := &App{db: pool}; mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.health)
	mux.HandleFunc("POST /api/v2/auth/register", a.register); mux.HandleFunc("POST /api/v2/auth/login", a.login); mux.HandleFunc("POST /api/v2/auth/logout", a.logout)
	mux.HandleFunc("GET /api/v2/me", a.auth(a.me)); mux.HandleFunc("GET /api/v2/dashboard", a.auth(a.dashboard))
	mux.HandleFunc("GET /api/v2/inventory", a.auth(a.inventory)); mux.HandleFunc("POST /api/v2/inventory", a.auth(a.addInventory))
	mux.HandleFunc("GET /api/v2/stockouts", a.auth(a.stockouts)); mux.HandleFunc("POST /api/v2/stockouts", a.auth(a.createStockout)); mux.HandleFunc("PATCH /api/v2/stockouts/{id}", a.auth(a.updateStockout))
	mux.HandleFunc("GET /api/v2/transfers", a.auth(a.transfers)); mux.HandleFunc("POST /api/v2/transfers", a.auth(a.createTransfer)); mux.HandleFunc("PATCH /api/v2/transfers/{id}", a.auth(a.updateTransfer))
	mux.HandleFunc("GET /api/v2/notifications", a.auth(a.notifications)); mux.HandleFunc("POST /api/v2/notifications/read", a.auth(a.readNotifications))
	mux.HandleFunc("GET /api/v2/analytics", a.auth(a.analytics)); mux.HandleFunc("GET /api/v2/billing", a.auth(a.billing)); mux.HandleFunc("GET /api/v2/hospitals", a.auth(a.hospitals)); mux.HandleFunc("GET /api/v2/stream", a.auth(a.stream))
	mux.HandleFunc("/", a.static)
	server := &http.Server{Addr: ":" + port, Handler: withCORS(logging(mux)), ReadHeaderTimeout: 10 * time.Second}
	log.Printf("MedRebalance V2 listening on :%s", port); log.Fatal(server.ListenAndServe())
}

func env(k, fallback string) string { if v := os.Getenv(k); v != "" { return v }; return fallback }
func withCORS(next http.Handler) http.Handler { return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Header().Set("Access-Control-Allow-Origin", "*"); w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization"); w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS"); if r.Method == http.MethodOptions { w.WriteHeader(http.StatusNoContent); return }; next.ServeHTTP(w, r) }) }
func logging(next http.Handler) http.Handler { return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { started := time.Now(); next.ServeHTTP(w, r); log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(started)) }) }
func jsonResponse(w http.ResponseWriter, status int, v any) { w.Header().Set("Content-Type", "application/json"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(v) }
func jsonError(w http.ResponseWriter, status int, msg string) { jsonResponse(w, status, map[string]any{"error": msg}) }
func decode(r *http.Request, v any) error { b, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)); if err != nil { return err }; defer r.Body.Close(); if len(b) == 0 { return errors.New("empty request") }; return json.Unmarshal(b, v) }
func newToken() string { b := make([]byte, 32); if _, err := rand.Read(b); err != nil { return "" }; return hex.EncodeToString(b) }
func bearer(r *http.Request) string { h := r.Header.Get("Authorization"); if strings.HasPrefix(h, "Bearer ") { return strings.TrimSpace(strings.TrimPrefix(h, "Bearer ")) }; return "" }
func (a *App) requireDB(w http.ResponseWriter) bool { if a.db == nil { jsonError(w, 503, "PostgreSQL is not configured"); return false }; return true }
func (a *App) health(w http.ResponseWriter, r *http.Request) { status := "ready"; if a.db == nil { status = "database_required" }; jsonResponse(w, 200, map[string]any{"ok": true, "service": "medrebalance-v2", "status": status, "timestamp": time.Now().UTC()}) }

func (a *App) register(w http.ResponseWriter, r *http.Request) {
	if !a.requireDB(w) { return }; var req registerRequest; if err := decode(r, &req); err != nil { jsonError(w, 400, "Invalid request"); return }
	req.Email, req.HospitalName, req.UserName = strings.ToLower(strings.TrimSpace(req.Email)), strings.TrimSpace(req.HospitalName), strings.TrimSpace(req.UserName)
	if req.Email == "" || req.HospitalName == "" || req.UserName == "" || len(req.Password) < 8 { jsonError(w, 400, "Hospital, name, email and an 8+ character password are required"); return }
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost); if err != nil { jsonError(w, 500, "Unable to secure password"); return }
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second); defer cancel(); tx, err := a.db.Begin(ctx); if err != nil { jsonError(w, 500, "Database unavailable"); return }; defer tx.Rollback(ctx)
	var hid, uid string
	if err = tx.QueryRow(ctx, "INSERT INTO hospitals(name) VALUES($1) RETURNING id", req.HospitalName).Scan(&hid); err != nil { jsonError(w, 409, "Hospital could not be created"); return }
	if err = tx.QueryRow(ctx, "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id", req.UserName, req.Email, string(hash)).Scan(&uid); err != nil { jsonError(w, 409, "Email is already registered"); return }
	if _, err = tx.Exec(ctx, "INSERT INTO hospital_users(user_id,hospital_id,role) VALUES($1,$2,'admin')", uid, hid); err != nil { jsonError(w, 500, "Unable to create hospital membership"); return }
	tok := newToken(); if _, err = tx.Exec(ctx, "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", tok, uid); err != nil { jsonError(w, 500, "Unable to create session"); return }
	if err = tx.Commit(ctx); err != nil { jsonError(w, 500, "Unable to finish registration"); return }
	jsonResponse(w, 201, map[string]any{"token": tok, "user": User{ID: uid, Email: req.Email, Name: req.UserName, HospitalID: hid, HospitalName: req.HospitalName, Role: "admin"}})
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	if !a.requireDB(w) { return }; var req credentials; if err := decode(r, &req); err != nil { jsonError(w, 400, "Invalid request"); return }; req.Email = strings.ToLower(strings.TrimSpace(req.Email)); ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second); defer cancel()
	var u User; var hash string
	err := a.db.QueryRow(ctx, `SELECT u.id,u.email,u.name,u.password_hash,h.id,h.name,hu.role FROM users u JOIN hospital_users hu ON hu.user_id=u.id JOIN hospitals h ON h.id=hu.hospital_id WHERE lower(u.email)=$1 ORDER BY CASE hu.role WHEN 'network_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1`, req.Email).Scan(&u.ID, &u.Email, &u.Name, &hash, &u.HospitalID, &u.HospitalName, &u.Role)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil { jsonError(w, 401, "Invalid email or password"); return }
	tok := newToken(); if _, err = a.db.Exec(ctx, "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", tok, u.ID); err != nil { jsonError(w, 500, "Unable to create session"); return }; jsonResponse(w, 200, map[string]any{"token": tok, "user": u})
}
func (a *App) logout(w http.ResponseWriter, r *http.Request) { if !a.requireDB(w) { return }; if t := bearer(r); t != "" { _, _ = a.db.Exec(r.Context(), "DELETE FROM sessions WHERE token=$1", t) }; jsonResponse(w, 200, map[string]bool{"ok": true}) }
func (a *App) auth(next func(http.ResponseWriter, *http.Request, User)) func(http.ResponseWriter, *http.Request) { return func(w http.ResponseWriter, r *http.Request) { if !a.requireDB(w) { return }; t := bearer(r); if t == "" { jsonError(w, 401, "Authentication required"); return }; var u User; err := a.db.QueryRow(r.Context(), `SELECT u.id,u.email,u.name,h.id,h.name,hu.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN hospital_users hu ON hu.user_id=u.id JOIN hospitals h ON h.id=hu.hospital_id WHERE s.token=$1 AND s.expires_at>now() ORDER BY CASE hu.role WHEN 'network_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1`, t).Scan(&u.ID, &u.Email, &u.Name, &u.HospitalID, &u.HospitalName, &u.Role); if err != nil { jsonError(w, 401, "Session expired"); return }; next(w, r, u) } }
func (a *App) me(w http.ResponseWriter, r *http.Request, u User) { jsonResponse(w, 200, map[string]any{"user": u}) }

func (a *App) dashboard(w http.ResponseWriter, r *http.Request, u User) {
	if u.Role == "network_admin" { var h, b, low, exp int; _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM hospitals").Scan(&h); _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM inventory_batches").Scan(&b); _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM inventory_batches WHERE quantity<=daily_run_rate*3").Scan(&low); _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM inventory_batches WHERE expiry_date<=current_date+30").Scan(&exp); jsonResponse(w, 200, map[string]any{"role": u.Role, "totalHospitals": h, "totalBatches": b, "lowStock": low, "expiring": exp}); return }
	var b, low, exp, tr int; _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM inventory_batches WHERE hospital_id=$1", u.HospitalID).Scan(&b); _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM inventory_batches WHERE hospital_id=$1 AND quantity<=daily_run_rate*3", u.HospitalID).Scan(&low); _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM inventory_batches WHERE hospital_id=$1 AND expiry_date<=current_date+30", u.HospitalID).Scan(&exp); _ = a.db.QueryRow(r.Context(), "SELECT count(*) FROM transfers WHERE (from_hospital_id=$1 OR to_hospital_id=$1) AND status IN ('pending','suggested')", u.HospitalID).Scan(&tr); jsonResponse(w, 200, map[string]any{"role": u.Role, "totalMedicines": b, "lowStock": low, "expiring": exp, "pendingTransfers": tr})
}

func (a *App) inventory(w http.ResponseWriter, r *http.Request, u User) { rows, err := a.db.Query(r.Context(), `SELECT ib.id,s.name,ib.batch_number,to_char(ib.expiry_date,'YYYY-MM-DD'),ib.quantity,ib.daily_run_rate,ib.unit_cost,CASE WHEN ib.quantity=0 THEN 'Critical' WHEN ib.quantity<=ib.daily_run_rate*3 THEN 'Low stock' WHEN ib.expiry_date<=current_date+30 THEN 'Expiring soon' ELSE 'In stock' END FROM inventory_batches ib JOIN skus s ON s.id=ib.sku_id WHERE ib.hospital_id=$1 ORDER BY ib.expiry_date`, u.HospitalID); if err != nil { jsonError(w, 500, "Unable to load inventory"); return }; defer rows.Close(); out := []inventoryItem{}; for rows.Next() { var x inventoryItem; if rows.Scan(&x.ID,&x.Medicine,&x.Batch,&x.Expiry,&x.Quantity,&x.DailyRunRate,&x.UnitCost,&x.Status)==nil { out=append(out,x) } }; jsonResponse(w,200,out) }
func (a *App) addInventory(w http.ResponseWriter, r *http.Request, u User) { var req struct{ Medicine string `json:"medicine"`; Batch string `json:"batch"`; Expiry string `json:"expiry"`; Quantity int `json:"quantity"`; DailyRunRate int `json:"dailyRunRate"`; UnitCost float64 `json:"unitCost"` }; if err:=decode(r,&req);err!=nil||strings.TrimSpace(req.Medicine)==""||strings.TrimSpace(req.Batch)==""||req.Quantity<=0||req.DailyRunRate<1||req.UnitCost<=0 { jsonError(w,400,"Medicine, batch, expiry, quantity, daily run rate and unit cost are required"); return }; tx,err:=a.db.Begin(r.Context());if err!=nil{jsonError(w,500,"Database unavailable");return};defer tx.Rollback(r.Context());var sku string;err=tx.QueryRow(r.Context(),"SELECT id FROM skus WHERE hospital_id=$1 AND lower(name)=lower($2) LIMIT 1",u.HospitalID,req.Medicine).Scan(&sku);if err==pgx.ErrNoRows{err=tx.QueryRow(r.Context(),"INSERT INTO skus(hospital_id,name,unit_cost,default_daily_run_rate) VALUES($1,$2,$3,$4) RETURNING id",u.HospitalID,req.Medicine,req.UnitCost,req.DailyRunRate).Scan(&sku)};if err!=nil{jsonError(w,500,"Unable to create medicine");return};_,err=tx.Exec(r.Context(),"INSERT INTO inventory_batches(hospital_id,sku_id,batch_number,expiry_date,quantity,daily_run_rate,unit_cost) VALUES($1,$2,$3,$4,$5,$6,$7)",u.HospitalID,sku,req.Batch,req.Expiry,req.Quantity,req.DailyRunRate,req.UnitCost);if err!=nil{jsonError(w,400,"Unable to add batch");return};if err=tx.Commit(r.Context());err!=nil{jsonError(w,500,"Unable to save inventory");return};jsonResponse(w,201,map[string]bool{"ok":true}) }

func (a *App) stockouts(w http.ResponseWriter, r *http.Request, u User) { rows,err:=a.db.Query(r.Context(),`SELECT sr.id,s.name,sr.quantity_needed,sr.urgency,sr.status,to_char(sr.created_at,'YYYY-MM-DD') FROM stockout_requests sr JOIN skus s ON s.id=sr.sku_id WHERE sr.hospital_id=$1 ORDER BY sr.created_at DESC`,u.HospitalID);if err!=nil{jsonError(w,500,"Unable to load stockout requests");return};defer rows.Close();type item struct{ID string `json:"id"`;Medicine string `json:"medicine"`;Quantity int `json:"quantity"`;Priority string `json:"priority"`;Status string `json:"status"`;Created string `json:"created"`};out:=[]item{};for rows.Next(){var x item;if rows.Scan(&x.ID,&x.Medicine,&x.Quantity,&x.Priority,&x.Status,&x.Created)==nil{out=append(out,x)}};jsonResponse(w,200,out) }
func (a *App) createStockout(w http.ResponseWriter,r *http.Request,u User){var req stockoutRequest;if err:=decode(r,&req);err!=nil||req.Medicine==""||req.Quantity<1{jsonError(w,400,"Medicine and positive quantity are required");return};var sku string;if err:=a.db.QueryRow(r.Context(),"SELECT id FROM skus WHERE hospital_id=$1 AND lower(name)=lower($2) LIMIT 1",u.HospitalID,req.Medicine).Scan(&sku);err!=nil{jsonError(w,404,"Medicine not found in hospital catalog");return};_,err:=a.db.Exec(r.Context(),"INSERT INTO stockout_requests(hospital_id,sku_id,quantity_needed,urgency,status,requested_by) VALUES($1,$2,$3,$4,'open',$5)",u.HospitalID,sku,req.Quantity,priority(req.Priority),u.ID);if err!=nil{jsonError(w,500,"Unable to create request");return};jsonResponse(w,201,map[string]bool{"ok":true}) }
func priority(v string)string{switch v{case"emergency","urgent","routine":return v;default:return"routine"}}
func (a *App) updateStockout(w http.ResponseWriter,r *http.Request,u User){id:=r.PathValue("id");var req struct{Status string `json:"status"`};if err:=decode(r,&req);err!=nil{jsonError(w,400,"Invalid request");return};if req.Status!="open"&&req.Status!="fulfilled"&&req.Status!="cancelled"{jsonError(w,400,"Invalid status");return};tag,err:=a.db.Exec(r.Context(),"UPDATE stockout_requests SET status=$1 WHERE id=$2 AND hospital_id=$3",req.Status,id,u.HospitalID);if err!=nil||tag.RowsAffected()==0{jsonError(w,404,"Request not found");return};jsonResponse(w,200,map[string]bool{"ok":true})}

func (a *App) transfers(w http.ResponseWriter,r *http.Request,u User){rows,err:=a.db.Query(r.Context(),`SELECT t.id,s.name,h1.name,h2.name,t.quantity,t.status,to_char(t.created_at,'YYYY-MM-DD') FROM transfers t JOIN skus s ON s.id=t.sku_id JOIN hospitals h1 ON h1.id=t.from_hospital_id JOIN hospitals h2 ON h2.id=t.to_hospital_id WHERE t.from_hospital_id=$1 OR t.to_hospital_id=$1 ORDER BY t.created_at DESC`,u.HospitalID);if err!=nil{jsonError(w,500,"Unable to load transfers");return};defer rows.Close();type item struct{ID string `json:"id"`;Medicine string `json:"medicine"`;From string `json:"from"`;To string `json:"to"`;Quantity int `json:"quantity"`;Status string `json:"status"`;Date string `json:"date"`};out:=[]item{};for rows.Next(){var x item;if rows.Scan(&x.ID,&x.Medicine,&x.From,&x.To,&x.Quantity,&x.Status,&x.Date)==nil{out=append(out,x)}};jsonResponse(w,200,out)}
func (a *App) createTransfer(w http.ResponseWriter,r *http.Request,u User){var req transferRequest;if err:=decode(r,&req);err!=nil||req.Medicine==""||req.ToHospital==""||req.Quantity<1{jsonError(w,400,"Medicine, destination and positive quantity are required");return};var sku,batch string;if err:=a.db.QueryRow(r.Context(),"SELECT s.id,ib.id FROM skus s JOIN inventory_batches ib ON ib.sku_id=s.id AND ib.hospital_id=s.hospital_id WHERE s.hospital_id=$1 AND lower(s.name)=lower($2) AND ib.quantity >= $3 ORDER BY ib.expiry_date LIMIT 1",u.HospitalID,req.Medicine,req.Quantity).Scan(&sku,&batch);err!=nil{jsonError(w,400,"No eligible inventory batch has enough stock");return};_,err:=a.db.Exec(r.Context(),"INSERT INTO transfers(sku_id,from_hospital_id,to_hospital_id,batch_id,quantity,status,requested_by) VALUES($1,$2,$3,$4,$5,'pending',$6)",sku,u.HospitalID,req.ToHospital,batch,req.Quantity,u.ID);if err!=nil{jsonError(w,400,"Unable to create transfer");return};jsonResponse(w,201,map[string]bool{"ok":true})}
func (a *App) updateTransfer(w http.ResponseWriter,r *http.Request,u User){id:=r.PathValue("id");var req struct{Status string `json:"status"`};if err:=decode(r,&req);err!=nil{jsonError(w,400,"Invalid request");return};allowed:=map[string]bool{"suggested":true,"pending":true,"in_transit":true,"completed":true,"cancelled":true};if !allowed[req.Status]{jsonError(w,400,"Invalid status");return};tag,err:=a.db.Exec(r.Context(),"UPDATE transfers SET status=$1,completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END WHERE id=$2 AND (from_hospital_id=$3 OR to_hospital_id=$3)",req.Status,id,u.HospitalID);if err!=nil||tag.RowsAffected()==0{jsonError(w,404,"Transfer not found");return};jsonResponse(w,200,map[string]bool{"ok":true})}

func (a *App) notifications(w http.ResponseWriter,r *http.Request,u User){rows,err:=a.db.Query(r.Context(),`SELECT id,title,message,event_type,read_at,to_char(created_at,'YYYY-MM-DD HH24:MI') FROM notifications WHERE hospital_id=$1 ORDER BY created_at DESC LIMIT 30`,u.HospitalID);if err!=nil{jsonError(w,500,"Unable to load notifications");return};defer rows.Close();type item struct{ID string `json:"id"`;Title string `json:"title"`;Message string `json:"message"`;Type string `json:"type"`;ReadAt *time.Time `json:"readAt"`;Created string `json:"created"`};out:=[]item{};for rows.Next(){var x item;if rows.Scan(&x.ID,&x.Title,&x.Message,&x.Type,&x.ReadAt,&x.Created)==nil{out=append(out,x)}};jsonResponse(w,200,out)}
func (a *App) readNotifications(w http.ResponseWriter,r *http.Request,u User){_,err:=a.db.Exec(r.Context(),"UPDATE notifications SET read_at=now() WHERE hospital_id=$1 AND read_at IS NULL",u.HospitalID);if err!=nil{jsonError(w,500,"Unable to update notifications");return};jsonResponse(w,200,map[string]bool{"ok":true})}
func (a *App) analytics(w http.ResponseWriter,r *http.Request,u User){var total,low,expired int;_ = a.db.QueryRow(r.Context(),"SELECT count(*) FROM inventory_batches WHERE hospital_id=$1",u.HospitalID).Scan(&total);_ = a.db.QueryRow(r.Context(),"SELECT count(*) FROM inventory_batches WHERE hospital_id=$1 AND quantity<=daily_run_rate*3",u.HospitalID).Scan(&low);_ = a.db.QueryRow(r.Context(),"SELECT count(*) FROM inventory_batches WHERE hospital_id=$1 AND expiry_date<current_date",u.HospitalID).Scan(&expired);jsonResponse(w,200,map[string]any{"inventoryBatches":total,"lowStock":low,"expired":expired,"fulfillmentRate":96})}
func (a *App) billing(w http.ResponseWriter,r *http.Request,u User){var plan,status string;var amount int;err:=a.db.QueryRow(r.Context(),"SELECT plan,monthly_amount,status FROM hospital_billing WHERE hospital_id=$1",u.HospitalID).Scan(&plan,&amount,&status);if err==pgx.ErrNoRows{plan="Starter";amount=0;status="active"};jsonResponse(w,200,map[string]any{"plan":plan,"monthlyAmount":amount,"currency":"INR","status":status})}
func (a *App) hospitals(w http.ResponseWriter,r *http.Request,u User){rows,err:=a.db.Query(r.Context(),"SELECT id,name FROM hospitals ORDER BY name");if err!=nil{jsonError(w,500,"Unable to load hospitals");return};defer rows.Close();out:=[]map[string]string{};for rows.Next(){var id,name string;if rows.Scan(&id,&name)==nil{out=append(out,map[string]string{"id":id,"name":name})}};jsonResponse(w,200,out)}
func (a *App) stream(w http.ResponseWriter,r *http.Request,u User){flusher,ok:=w.(http.Flusher);if !ok{jsonError(w,500,"Streaming unavailable");return};w.Header().Set("Content-Type","text/event-stream");w.Header().Set("Cache-Control","no-cache");fmt.Fprintf(w,"event: ready\ndata: {\"hospitalId\":\"%s\"}\n\n",u.HospitalID);flusher.Flush();ticker:=time.NewTicker(25*time.Second);defer ticker.Stop();for{select{case<-r.Context().Done():return;case t:=<-ticker.C:fmt.Fprintf(w,"event: heartbeat\ndata: {\"at\":\"%s\"}\n\n",t.UTC().Format(time.RFC3339));flusher.Flush()}}}
func (a *App) static(w http.ResponseWriter,r *http.Request){root:=env("STATIC_DIR","./frontend/dist");path:=strings.ReplaceAll(r.URL.Path,"..","");if path==""||path=="/"{path="/index.html"};file:=root+path;if _,err:=os.Stat(file);err!=nil{file=root+"/index.html"};http.ServeFile(w,r,file)}

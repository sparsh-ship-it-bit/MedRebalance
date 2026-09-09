import { Router, type IRouter, type Request } from "express";

const router: IRouter = Router();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  return req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";
}

function takeRateLimit(req: Request): boolean {
  const now = Date.now();
  const key = clientKey(req);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

function config() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Server Supabase registration is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Render.");
  }
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, serviceKey } = config();
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${url}${path}`, { ...init, headers });
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { msg?: string; message?: string; error_description?: string; error?: string };
    return body.msg || body.message || body.error_description || body.error || `Supabase request failed (${response.status})`;
  } catch {
    return `Supabase request failed (${response.status})`;
  }
}

router.post("/register-hospital", async (req, res) => {
  if (!takeRateLimit(req)) {
    res.status(429).json({ error: "Too many registration attempts. Please wait 15 minutes and try again." });
    return;
  }

  const { hospitalName, address, city, hospitalType, lat, lng, email, password } = req.body ?? {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!hospitalName?.trim() || !address?.trim() || !city || !hospitalType || !normalizedEmail || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Please provide a hospital name, address, city, hospital type, valid email, and a password of at least 6 characters." });
    return;
  }

  let userId: string | undefined;
  let hospitalId: string | undefined;

  try {
    // Create a confirmed Auth user server-side. This deliberately does not send
    // a confirmation email, so registration is independent of Supabase email delivery.
    const authResponse = await supabaseRequest("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { hospital_name: hospitalName.trim() },
      }),
    });

    if (!authResponse.ok) {
      const message = await readError(authResponse);
      const status = authResponse.status === 422 || authResponse.status === 400 ? 400 : authResponse.status;
      res.status(status).json({ error: message.includes("already") ? "This email is already registered. Sign in instead, or use a different email address." : message });
      return;
    }

    const authUser = await authResponse.json() as { id?: string };
    userId = authUser.id;
    if (!userId) throw new Error("Supabase did not return the new user id.");

    const hospitalResponse = await supabaseRequest("/rest/v1/hospitals", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: hospitalName.trim(),
        address: `${address.trim()}, ${city}`,
        lat: Number(lat),
        lng: Number(lng),
        type: hospitalType,
      }),
    });
    if (!hospitalResponse.ok) throw new Error(await readError(hospitalResponse));

    const hospitals = await hospitalResponse.json() as Array<{ id?: string }>;
    hospitalId = hospitals[0]?.id;
    if (!hospitalId) throw new Error("Hospital was created but Supabase did not return its id.");

    const linkResponse = await supabaseRequest("/rest/v1/hospital_users", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, hospital_id: hospitalId, role: "admin" }),
    });
    if (!linkResponse.ok) throw new Error(await readError(linkResponse));

    res.status(201).json({ ok: true, email: normalizedEmail });
  } catch (error) {
    // Best-effort cleanup prevents an orphaned Auth user if a later database step fails.
    if (userId) {
      try { await supabaseRequest(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }); } catch { /* ignore cleanup errors */ }
    }
    if (hospitalId) {
      try { await supabaseRequest(`/rest/v1/hospitals?id=eq.${encodeURIComponent(hospitalId)}`, { method: "DELETE" }); } catch { /* ignore cleanup errors */ }
    }
    res.status(503).json({ error: error instanceof Error ? error.message : "Unable to register the hospital." });
  }
});

export default router;

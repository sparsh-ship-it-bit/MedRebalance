import { Router } from "express";

const router = Router();

const ROLE_PASSWORD_ENV: Record<string, string> = {
  pharmacist: "ROLE_GATE_PHARMACIST_PASSWORD",
  admin: "ROLE_GATE_ADMIN_PASSWORD",
  network_admin: "ROLE_GATE_NETWORK_ADMIN_PASSWORD",
};

router.post("/role-gate", (req, res) => {
  const role = typeof req.body?.role === "string" ? req.body.role : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const envName = ROLE_PASSWORD_ENV[role];

  if (!envName || !password) {
    res.status(400).json({ error: "Choose a valid role and enter its gate password." });
    return;
  }

  const configuredPassword = process.env[envName];
  if (!configuredPassword) {
    res.status(503).json({ error: "This role gate is not configured yet." });
    return;
  }

  if (password !== configuredPassword) {
    res.status(401).json({ error: "Incorrect gate password." });
    return;
  }

  res.status(200).json({ ok: true, role });
});

export default router;

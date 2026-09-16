# MedRebalance V2

A clean rewrite of MedRebalance using **TypeScript + Go + PostgreSQL**.

## Architecture

```text
Browser (TypeScript)
        |
        v
      Go API
        |
        v
   PostgreSQL
```

Supabase is not used by the V2 runtime. Node/Express is not used as the backend runtime.

## Included V2 product areas

- Secure hospital registration and session authentication
- Hospital admin workspace
- Dashboard and operational KPIs
- Inventory batch management
- Expiry and low-stock detection
- Stockout requests
- Hospital-to-hospital transfer creation/tracking
- Analytics
- Notifications
- Billing/subscription view
- PostgreSQL-backed audit-ready schema
- Server-Sent Events stream endpoint
- Responsive desktop/tablet/mobile UI

## Deploy

The `v2/Dockerfile` builds the TypeScript frontend and Go API into one production image. `v2/render.yaml` describes a Render web service plus a managed PostgreSQL database.

## Local

```bash
cd v2/frontend
npm install
npm run build

cd ../backend
DATABASE_URL='postgres://...' go run .
```

The Go service initializes `schema.sql` on startup and serves the compiled frontend when `STATIC_DIR` points to `frontend/dist`.

## First use

Open the V2 app and select **Create workspace**. A PostgreSQL-backed hospital, admin account and session are created. Passwords are stored using bcrypt.

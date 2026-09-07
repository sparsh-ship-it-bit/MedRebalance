/*
# MedRebalance — Core Schema

## Overview
Creates the full database schema for MedRebalance, a B2B platform for medical
consumable expiry detection and regional stockout rebalancing across hospitals.

## New Tables
1. `hospitals` — medical facilities with geo-coordinates for map visualization
   - id, name, address, lat, lng, type, created_at
2. `skus` — medical supply catalog (15 SKUs)
   - id, name, category, unit_cost, cold_chain_required, default_daily_run_rate
3. `inventory_batches` — stock batches held at each hospital
   - id, hospital_id, sku_id, batch_number, quantity, expiry_date, unit_cost,
     daily_run_rate, status (active/surplus/expired), created_at
4. `stockout_requests` — shortage reports from hospitals
   - id, hospital_id, sku_id, quantity_needed, urgency (routine/urgent/emergency),
     status (open/fulfilled/cancelled), created_at
5. `transfers` — rebalancing transfers between hospitals
   - id, from_hospital_id, to_hospital_id, batch_id, sku_id, quantity, status
     (suggested/in_transit/completed/cancelled), distance_km, transfer_cost,
     created_at, completed_at
6. `transactions` — settlement ledger for completed transfers
   - id, transfer_id, total_batch_value, platform_fee, waste_cost_prevented,
     created_at

## Security
- RLS enabled on all tables.
- This is a no-auth demo app (role-based portals are a UI toggle, not real auth).
- All policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because the data is intentionally shared/public for demo purposes.

## Notes
- All tables use UUID primary keys with gen_random_uuid() defaults.
- Timestamps default to now().
- Foreign keys enforce referential integrity.
*/

-- Hospitals
CREATE TABLE IF NOT EXISTS hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  type text NOT NULL DEFAULT 'hospital',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_hospitals" ON hospitals;
CREATE POLICY "anon_select_hospitals" ON hospitals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_hospitals" ON hospitals;
CREATE POLICY "anon_insert_hospitals" ON hospitals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_hospitals" ON hospitals;
CREATE POLICY "anon_update_hospitals" ON hospitals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_hospitals" ON hospitals;
CREATE POLICY "anon_delete_hospitals" ON hospitals FOR DELETE TO anon, authenticated USING (true);

-- SKUs (medical supply catalog)
CREATE TABLE IF NOT EXISTS skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  unit_cost numeric NOT NULL,
  cold_chain_required boolean NOT NULL DEFAULT false,
  default_daily_run_rate integer NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_skus" ON skus;
CREATE POLICY "anon_select_skus" ON skus FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_skus" ON skus;
CREATE POLICY "anon_insert_skus" ON skus FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_skus" ON skus;
CREATE POLICY "anon_update_skus" ON skus FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_skus" ON skus;
CREATE POLICY "anon_delete_skus" ON skus FOR DELETE TO anon, authenticated USING (true);

-- Inventory batches
CREATE TABLE IF NOT EXISTS inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  expiry_date date NOT NULL,
  unit_cost numeric NOT NULL,
  daily_run_rate integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_batches" ON inventory_batches;
CREATE POLICY "anon_select_batches" ON inventory_batches FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_batches" ON inventory_batches;
CREATE POLICY "anon_insert_batches" ON inventory_batches FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_batches" ON inventory_batches;
CREATE POLICY "anon_update_batches" ON inventory_batches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_batches" ON inventory_batches;
CREATE POLICY "anon_delete_batches" ON inventory_batches FOR DELETE TO anon, authenticated USING (true);

-- Stockout requests
CREATE TABLE IF NOT EXISTS stockout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  quantity_needed integer NOT NULL,
  urgency text NOT NULL DEFAULT 'routine' CHECK (urgency IN ('routine', 'urgent', 'emergency')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stockout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_stockouts" ON stockout_requests;
CREATE POLICY "anon_select_stockouts" ON stockout_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_stockouts" ON stockout_requests;
CREATE POLICY "anon_insert_stockouts" ON stockout_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_stockouts" ON stockout_requests;
CREATE POLICY "anon_update_stockouts" ON stockout_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_stockouts" ON stockout_requests;
CREATE POLICY "anon_delete_stockouts" ON stockout_requests FOR DELETE TO anon, authenticated USING (true);

-- Transfers
CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  to_hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'in_transit', 'completed', 'cancelled')),
  distance_km double precision NOT NULL DEFAULT 0,
  transfer_cost double precision NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_transfers" ON transfers;
CREATE POLICY "anon_select_transfers" ON transfers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transfers" ON transfers;
CREATE POLICY "anon_insert_transfers" ON transfers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transfers" ON transfers;
CREATE POLICY "anon_update_transfers" ON transfers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transfers" ON transfers;
CREATE POLICY "anon_delete_transfers" ON transfers FOR DELETE TO anon, authenticated USING (true);

-- Transactions (settlement ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  total_batch_value numeric NOT NULL,
  platform_fee numeric NOT NULL,
  waste_cost_prevented numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE TO anon, authenticated USING (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_batches_hospital ON inventory_batches(hospital_id);
CREATE INDEX IF NOT EXISTS idx_batches_sku ON inventory_batches(sku_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON inventory_batches(status);
CREATE INDEX IF NOT EXISTS idx_stockouts_status ON stockout_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(transfer_id);
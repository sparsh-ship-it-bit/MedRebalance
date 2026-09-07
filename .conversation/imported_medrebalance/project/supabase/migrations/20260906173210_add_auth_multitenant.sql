/*
# Add Authentication & Multi-Tenant Data Scoping

## Overview
Adds the hospital_users junction table to link Supabase Auth users to hospitals
with a role (pharmacist, admin, or network_admin). Tightens RLS policies across
all tables so that:
  - Authenticated users can READ all data (needed for cross-hospital surplus
    matching by the rebalance algorithm).
  - WRITE access (INSERT/UPDATE/DELETE) is scoped: pharmacists can only write
    to their own hospital's inventory_batches and stockout_requests; network_admin
    has full CRUD on everything (needed for Reset Demo Data and rebalancing).
  - Anon (unauthenticated) access is removed — the app now requires sign-in.

## New Tables
1. `hospital_users`
   - id (uuid, primary key)
   - user_id (uuid, NOT NULL, DEFAULT auth.uid(), references auth.users ON DELETE CASCADE)
   - hospital_id (uuid, NOT NULL, references hospitals ON DELETE CASCADE)
   - role (text, NOT NULL, CHECK in 'pharmacist', 'admin', 'network_admin')
   - created_at (timestamptz, default now())
   - Unique constraint on (user_id, hospital_id) to prevent duplicate links

## Modified Tables
None modified structurally. RLS policies replaced on ALL existing tables:
  hospitals, skus, inventory_batches, stockout_requests, transfers, transactions

## Security Changes
1. hospital_users: RLS enabled. Users can SELECT/INSERT/UPDATE their own rows
   (auth.uid() = user_id). network_admin can read all.
2. hospitals: SELECT open to authenticated. INSERT open to authenticated (for
   registration). UPDATE/DELETE restricted to network_admin.
3. skus: SELECT open to authenticated. All writes restricted to network_admin.
4. inventory_batches: SELECT open to authenticated (matching engine needs this).
   INSERT/UPDATE restricted to users linked to the batch's hospital_id OR
   network_admin. DELETE restricted to network_admin.
5. stockout_requests: SELECT open to authenticated. INSERT/UPDATE restricted
   to users linked to the request's hospital_id OR network_admin. DELETE
   restricted to network_admin.
6. transfers: SELECT open to authenticated. All writes restricted to
   network_admin (only network_admin triggers rebalancing).
7. transactions: SELECT open to authenticated. All writes restricted to
   network_admin.

## Important Notes
1. The DEFAULT auth.uid() on hospital_users.user_id ensures that during
   registration, the insert succeeds even when the frontend omits user_id.
2. SELECT remains open to all authenticated users because the rebalance
   algorithm needs to read surplus inventory across ALL hospitals — restricting
   SELECT to own hospital would break the matching engine.
3. WRITE access is what's scoped, not READ — this is by design.
4. The network_admin role gets full CRUD on all tables so that the "Reset Demo
   Data" button and "Run Rebalance" actions work from the seeded test account.
*/

-- ============================================================
-- 1. Create hospital_users table
-- ============================================================

CREATE TABLE IF NOT EXISTS hospital_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('pharmacist', 'admin', 'network_admin')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, hospital_id)
);

ALTER TABLE hospital_users ENABLE ROW LEVEL SECURITY;

-- hospital_users policies
DROP POLICY IF EXISTS "select_own_hospital_users" ON hospital_users;
CREATE POLICY "select_own_hospital_users" ON hospital_users FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "insert_own_hospital_users" ON hospital_users;
CREATE POLICY "insert_own_hospital_users" ON hospital_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_hospital_users" ON hospital_users;
CREATE POLICY "update_own_hospital_users" ON hospital_users FOR UPDATE
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_hospital_users" ON hospital_users;
CREATE POLICY "delete_own_hospital_users" ON hospital_users FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_hospital_users_user ON hospital_users(user_id);
CREATE INDEX IF NOT EXISTS idx_hospital_users_hospital ON hospital_users(hospital_id);

-- ============================================================
-- 2. hospitals — replace policies
-- ============================================================

DROP POLICY IF EXISTS "anon_select_hospitals" ON hospitals;
DROP POLICY IF EXISTS "anon_insert_hospitals" ON hospitals;
DROP POLICY IF EXISTS "anon_update_hospitals" ON hospitals;
DROP POLICY IF EXISTS "anon_delete_hospitals" ON hospitals;

DROP POLICY IF EXISTS "auth_select_hospitals" ON hospitals;
CREATE POLICY "auth_select_hospitals" ON hospitals FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_hospitals" ON hospitals;
CREATE POLICY "auth_insert_hospitals" ON hospitals FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_hospitals" ON hospitals;
CREATE POLICY "auth_update_hospitals" ON hospitals FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_delete_hospitals" ON hospitals;
CREATE POLICY "auth_delete_hospitals" ON hospitals FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

-- ============================================================
-- 3. skus — replace policies
-- ============================================================

DROP POLICY IF EXISTS "anon_select_skus" ON skus;
DROP POLICY IF EXISTS "anon_insert_skus" ON skus;
DROP POLICY IF EXISTS "anon_update_skus" ON skus;
DROP POLICY IF EXISTS "anon_delete_skus" ON skus;

DROP POLICY IF EXISTS "auth_select_skus" ON skus;
CREATE POLICY "auth_select_skus" ON skus FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_skus" ON skus;
CREATE POLICY "auth_insert_skus" ON skus FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_update_skus" ON skus;
CREATE POLICY "auth_update_skus" ON skus FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_delete_skus" ON skus;
CREATE POLICY "auth_delete_skus" ON skus FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

-- ============================================================
-- 4. inventory_batches — replace policies
-- SELECT open to all authenticated (matching engine needs cross-hospital reads)
-- INSERT/UPDATE restricted to own hospital or network_admin
-- DELETE restricted to network_admin
-- ============================================================

DROP POLICY IF EXISTS "anon_select_batches" ON inventory_batches;
DROP POLICY IF EXISTS "anon_insert_batches" ON inventory_batches;
DROP POLICY IF EXISTS "anon_update_batches" ON inventory_batches;
DROP POLICY IF EXISTS "anon_delete_batches" ON inventory_batches;

DROP POLICY IF EXISTS "auth_select_batches" ON inventory_batches;
CREATE POLICY "auth_select_batches" ON inventory_batches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_batches" ON inventory_batches;
CREATE POLICY "auth_insert_batches" ON inventory_batches FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND hu.hospital_id = inventory_batches.hospital_id
    )
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_update_batches" ON inventory_batches;
CREATE POLICY "auth_update_batches" ON inventory_batches FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND hu.hospital_id = inventory_batches.hospital_id
    )
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND hu.hospital_id = inventory_batches.hospital_id
    )
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_delete_batches" ON inventory_batches;
CREATE POLICY "auth_delete_batches" ON inventory_batches FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

-- ============================================================
-- 5. stockout_requests — replace policies
-- SELECT open to all authenticated (matching engine needs cross-hospital reads)
-- INSERT/UPDATE restricted to own hospital or network_admin
-- DELETE restricted to network_admin
-- ============================================================

DROP POLICY IF EXISTS "anon_select_stockouts" ON stockout_requests;
DROP POLICY IF EXISTS "anon_insert_stockouts" ON stockout_requests;
DROP POLICY IF EXISTS "anon_update_stockouts" ON stockout_requests;
DROP POLICY IF EXISTS "anon_delete_stockouts" ON stockout_requests;

DROP POLICY IF EXISTS "auth_select_stockouts" ON stockout_requests;
CREATE POLICY "auth_select_stockouts" ON stockout_requests FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_stockouts" ON stockout_requests;
CREATE POLICY "auth_insert_stockouts" ON stockout_requests FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND hu.hospital_id = stockout_requests.hospital_id
    )
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_update_stockouts" ON stockout_requests;
CREATE POLICY "auth_update_stockouts" ON stockout_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND hu.hospital_id = stockout_requests.hospital_id
    )
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND hu.hospital_id = stockout_requests.hospital_id
    )
    OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_delete_stockouts" ON stockout_requests;
CREATE POLICY "auth_delete_stockouts" ON stockout_requests FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

-- ============================================================
-- 6. transfers — replace policies
-- SELECT open to all authenticated
-- All writes restricted to network_admin
-- ============================================================

DROP POLICY IF EXISTS "anon_select_transfers" ON transfers;
DROP POLICY IF EXISTS "anon_insert_transfers" ON transfers;
DROP POLICY IF EXISTS "anon_update_transfers" ON transfers;
DROP POLICY IF EXISTS "anon_delete_transfers" ON transfers;

DROP POLICY IF EXISTS "auth_select_transfers" ON transfers;
CREATE POLICY "auth_select_transfers" ON transfers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_transfers" ON transfers;
CREATE POLICY "auth_insert_transfers" ON transfers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_update_transfers" ON transfers;
CREATE POLICY "auth_update_transfers" ON transfers FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_delete_transfers" ON transfers;
CREATE POLICY "auth_delete_transfers" ON transfers FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

-- ============================================================
-- 7. transactions — replace policies
-- SELECT open to all authenticated
-- All writes restricted to network_admin
-- ============================================================

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;

DROP POLICY IF EXISTS "auth_select_transactions" ON transactions;
CREATE POLICY "auth_select_transactions" ON transactions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_transactions" ON transactions;
CREATE POLICY "auth_insert_transactions" ON transactions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_update_transactions" ON transactions;
CREATE POLICY "auth_update_transactions" ON transactions FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "auth_delete_transactions" ON transactions;
CREATE POLICY "auth_delete_transactions" ON transactions FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );
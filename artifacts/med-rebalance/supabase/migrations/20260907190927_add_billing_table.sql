/*
# Add hospital_billing table for Stripe subscription tracking

## Overview
Stores Stripe customer/subscription IDs and subscription status per hospital.
Used by the Billing tab in the Admin dashboard to show subscription state.

## New Table
- hospital_billing
  - hospital_id (uuid PK, references hospitals ON DELETE CASCADE)
  - stripe_customer_id (text, nullable)
  - stripe_subscription_id (text, nullable)
  - subscription_status (text, CHECK in 'none','active','past_due','canceled')
  - subscription_amount (numeric, monthly fee in paise)
  - current_period_end (timestamptz, nullable)
  - created_at, updated_at

## Security
- RLS enabled. SELECT restricted to the hospital's own users or network_admin.
  INSERT/UPDATE restricted to network_admin (or the Stripe webhook edge function
  using the service role key, which bypasses RLS).
*/

CREATE TABLE IF NOT EXISTS hospital_billing (
  hospital_id uuid PRIMARY KEY REFERENCES hospitals(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text NOT NULL DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled')),
  subscription_amount numeric NOT NULL DEFAULT 0,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hospital_billing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_billing" ON hospital_billing;
CREATE POLICY "select_billing" ON hospital_billing FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = hospital_billing.hospital_id OR hu.role = 'network_admin')
    )
  );

DROP POLICY IF EXISTS "insert_billing_admin" ON hospital_billing;
CREATE POLICY "insert_billing_admin" ON hospital_billing FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

DROP POLICY IF EXISTS "update_billing_admin" ON hospital_billing;
CREATE POLICY "update_billing_admin" ON hospital_billing FOR UPDATE
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

/*
# Add Audit Log + Notification Events Tables

## Overview
Creates two new tables for production-grade accountability and notifications:
  - audit_log: records who did what (user_id, action, table_name, record_id,
    details, timestamp) for every inventory change, transfer, and settlement.
  - notification_events: stores in-app notification events per hospital for
    the notification bell UI.

## New Tables
1. audit_log
   - id (uuid, primary key)
   - user_id (uuid, references auth.users ON DELETE SET NULL)
   - hospital_id (uuid, references hospitals ON DELETE CASCADE)
   - action (text, e.g. 'inventory.add', 'transfer.complete', 'stockout.report')
   - table_name (text, which table was affected)
   - record_id (uuid, the row ID that was changed)
   - details (jsonb, additional context)
   - created_at (timestamptz, default now())

2. notification_events
   - id (uuid, primary key)
   - hospital_id (uuid, references hospitals ON DELETE CASCADE)
   - event_type (text, e.g. 'surplus_flagged', 'stockout_matched', 'transfer_status')
   - title (text, short summary)
   - message (text, detail body)
   - is_read (boolean, default false)
   - created_at (timestamptz, default now())

## Security
- audit_log: RLS enabled. Only network_admin can SELECT (admin-read-only).
  INSERT allowed for any authenticated user (they create audit entries for
  their own actions). No UPDATE or DELETE — audit logs are immutable.
- notification_events: RLS enabled. Users can SELECT/UPDATE only notifications
  for their own linked hospital. network_admin can see all. INSERT allowed for
  any authenticated user (system creates notifications for relevant hospitals).
*/

-- ============================================================
-- 1. audit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hospital_id uuid REFERENCES hospitals(id) ON DELETE CASCADE,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only network_admin can read audit logs
DROP POLICY IF EXISTS "select_audit_log_admin" ON audit_log;
CREATE POLICY "select_audit_log_admin" ON audit_log FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'
    )
  );

-- Any authenticated user can insert audit entries (for their own actions)
DROP POLICY IF EXISTS "insert_audit_log" ON audit_log;
CREATE POLICY "insert_audit_log" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- No UPDATE or DELETE policies — audit logs are immutable

CREATE INDEX IF NOT EXISTS idx_audit_log_hospital ON audit_log(hospital_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================================
-- 2. notification_events
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

-- Users can read notifications for their own hospital; network_admin sees all
DROP POLICY IF EXISTS "select_notifications" ON notification_events;
CREATE POLICY "select_notifications" ON notification_events FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = notification_events.hospital_id OR hu.role = 'network_admin')
    )
  );

-- Users can mark their own hospital's notifications as read
DROP POLICY IF EXISTS "update_notifications" ON notification_events;
CREATE POLICY "update_notifications" ON notification_events FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = notification_events.hospital_id OR hu.role = 'network_admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = notification_events.hospital_id OR hu.role = 'network_admin')
    )
  );

-- Any authenticated user can insert notifications (system-generated)
DROP POLICY IF EXISTS "insert_notifications" ON notification_events;
CREATE POLICY "insert_notifications" ON notification_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- No DELETE — notifications are persistent
CREATE INDEX IF NOT EXISTS idx_notifications_hospital ON notification_events(hospital_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notification_events(hospital_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notification_events(created_at DESC);
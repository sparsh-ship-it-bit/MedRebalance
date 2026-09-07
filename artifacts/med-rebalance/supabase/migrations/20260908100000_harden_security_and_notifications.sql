-- MedRebalance security hardening.
-- This migration supersedes the permissive demo policies from the imported schema.

ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_events_dedupe
  ON notification_events (hospital_id, event_type, source_key)
  WHERE source_key IS NOT NULL;

-- Inventory and shortage writes must stay within the signed-in user's hospital.
DROP POLICY IF EXISTS "auth_select_batches" ON inventory_batches;
DROP POLICY IF EXISTS "auth_insert_batches" ON inventory_batches;
DROP POLICY IF EXISTS "auth_update_batches" ON inventory_batches;
DROP POLICY IF EXISTS "auth_delete_batches" ON inventory_batches;
CREATE POLICY "select_batches_by_hospital" ON inventory_batches FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = inventory_batches.hospital_id OR hu.role = 'network_admin'))
  );
CREATE POLICY "write_batches_by_hospital" ON inventory_batches FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = inventory_batches.hospital_id OR hu.role = 'network_admin'))
  );
CREATE POLICY "update_batches_by_hospital" ON inventory_batches FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = inventory_batches.hospital_id OR hu.role = 'network_admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = inventory_batches.hospital_id OR hu.role = 'network_admin'))
  );
CREATE POLICY "delete_batches_by_hospital" ON inventory_batches FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = inventory_batches.hospital_id OR hu.role = 'network_admin'))
  );

DROP POLICY IF EXISTS "auth_select_stockouts" ON stockout_requests;
DROP POLICY IF EXISTS "auth_insert_stockouts" ON stockout_requests;
DROP POLICY IF EXISTS "auth_update_stockouts" ON stockout_requests;
DROP POLICY IF EXISTS "auth_delete_stockouts" ON stockout_requests;
CREATE POLICY "select_stockouts_by_hospital" ON stockout_requests FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = stockout_requests.hospital_id OR hu.role = 'network_admin'))
  );
CREATE POLICY "write_stockouts_by_hospital" ON stockout_requests FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = stockout_requests.hospital_id OR hu.role = 'network_admin'))
  );
CREATE POLICY "update_stockouts_by_hospital" ON stockout_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = stockout_requests.hospital_id OR hu.role = 'network_admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = stockout_requests.hospital_id OR hu.role = 'network_admin'))
  );
CREATE POLICY "delete_stockouts_by_hospital" ON stockout_requests FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = stockout_requests.hospital_id OR hu.role = 'network_admin'))
  );

-- Transfers and settlement rows are created by the network rebalancing workflow,
-- not by a client-side pharmacist.
DROP POLICY IF EXISTS "auth_select_transfers" ON transfers;
DROP POLICY IF EXISTS "auth_insert_transfers" ON transfers;
DROP POLICY IF EXISTS "auth_update_transfers" ON transfers;
DROP POLICY IF EXISTS "auth_delete_transfers" ON transfers;
CREATE POLICY "select_transfers_by_hospital" ON transfers FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = transfers.from_hospital_id
        OR hu.hospital_id = transfers.to_hospital_id
        OR hu.role = 'network_admin'))
  );
CREATE POLICY "network_write_transfers" ON transfers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'));
CREATE POLICY "network_update_transfers" ON transfers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'));
CREATE POLICY "network_delete_transfers" ON transfers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'));

DROP POLICY IF EXISTS "auth_select_transactions" ON transactions;
DROP POLICY IF EXISTS "auth_insert_transactions" ON transactions;
DROP POLICY IF EXISTS "auth_update_transactions" ON transactions;
DROP POLICY IF EXISTS "auth_delete_transactions" ON transactions;
CREATE POLICY "select_transactions_by_hospital" ON transactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM hospital_users hu
    JOIN transfers t ON t.id = transactions.transfer_id
    WHERE hu.user_id = auth.uid()
      AND (hu.hospital_id = t.from_hospital_id OR hu.hospital_id = t.to_hospital_id OR hu.role = 'network_admin')
  ));
CREATE POLICY "network_write_transactions" ON transactions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'));
CREATE POLICY "network_update_transactions" ON transactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'));
CREATE POLICY "network_delete_transactions" ON transactions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM hospital_users hu WHERE hu.user_id = auth.uid() AND hu.role = 'network_admin'));

-- Audit logs are immutable and readable only by network administrators.
DROP POLICY IF EXISTS "insert_audit_log" ON audit_log;
CREATE POLICY "insert_own_audit_log" ON audit_log FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (hospital_id IS NULL OR EXISTS (
      SELECT 1 FROM hospital_users hu
      WHERE hu.user_id = auth.uid() AND (hu.hospital_id = audit_log.hospital_id OR hu.role = 'network_admin')
    ))
  );

-- Notification writes are scoped too; the email function uses service_role for
-- system-generated delivery and bypasses these policies.
DROP POLICY IF EXISTS "insert_notifications" ON notification_events;
CREATE POLICY "insert_own_notifications" ON notification_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM hospital_users hu
    WHERE hu.user_id = auth.uid() AND (hu.hospital_id = notification_events.hospital_id OR hu.role = 'network_admin')
  ));
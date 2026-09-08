-- Enable Supabase Realtime for operational tables.
-- Realtime events never replace authorization: clients still receive rows
-- according to the table's RLS policies.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE hospitals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_batches;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE stockout_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE transfers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Required for reliable UPDATE/DELETE payloads.
ALTER TABLE hospitals REPLICA IDENTITY FULL;
ALTER TABLE inventory_batches REPLICA IDENTITY FULL;
ALTER TABLE stockout_requests REPLICA IDENTITY FULL;
ALTER TABLE transfers REPLICA IDENTITY FULL;
ALTER TABLE transactions REPLICA IDENTITY FULL;
ALTER TABLE notification_events REPLICA IDENTITY FULL;

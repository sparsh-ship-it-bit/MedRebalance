/*
 * audit.ts — Audit logging utility.
 *
 * Role in the architecture:
 *   Provides a single `logAudit()` function that inserts a row into the
 *   `audit_log` table recording who did what. Every mutation in the data
 *   layer (add inventory, create stockout, create/complete/cancel transfer,
 *   reset demo data) calls this to create an immutable trail of actions.
 *   The audit_log table has RLS that allows only network_admin to read,
 *   making it admin-read-only as required for accountability.
 */

import { supabase } from './supabase';

export async function logAudit(entry: {
  user_id?: string;
  hospital_id?: string;
  action: string;
  table_name: string;
  record_id?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      user_id: entry.user_id ?? null,
      hospital_id: entry.hospital_id ?? null,
      action: entry.action,
      table_name: entry.table_name,
      record_id: entry.record_id ?? null,
      details: entry.details ?? {},
    });
    if (error) console.error('Failed to log audit entry:', error);
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  hospital_id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function fetchAuditLogs(limit: number = 50): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditLogEntry[];
}

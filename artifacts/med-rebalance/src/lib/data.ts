/**
 * Data-access layer — fetches and mutates data through Supabase.
 * All reads use retry() for transient network resilience. All mutations
 * also call logAudit() to create an immutable audit trail and createNotification()
 * to surface relevant events in the in-app notification bell.
 */

import { supabase } from './supabase';
import { retry } from './retry';
import { logAudit } from './audit';
import { createNotification } from './notifications';
import type {
  Hospital,
  InventoryBatch,
  Sku,
  StockoutRequest,
  Transfer,
  Transaction,
  Urgency,
} from './types';

// ---- Hospitals ----

export async function fetchHospitals(): Promise<Hospital[]> {
  return retry(async () => {
    const { data, error } = await supabase.from('hospitals').select('*').order('name');
    if (error) throw error;
    return data ?? [];
  });
}

// ---- SKUs ----

export async function fetchSkus(): Promise<Sku[]> {
  return retry(async () => {
    const { data, error } = await supabase.from('skus').select('*').order('name');
    if (error) throw error;
    return data ?? [];
  });
}

export async function fetchSkuColdChainMap(): Promise<Record<string, boolean>> {
  const skus = await fetchSkus();
  const map: Record<string, boolean> = {};
  for (const s of skus) map[s.id] = s.cold_chain_required;
  return map;
}

// ---- Inventory ----

export interface InventoryWithRelations extends InventoryBatch {
  hospital: Hospital;
  sku: Sku;
}

export async function fetchAllInventory(): Promise<InventoryWithRelations[]> {
  return retry(async () => {
    const { data, error } = await supabase
      .from('inventory_batches')
      .select('*, hospital: hospitals(*), sku: skus(*)')
      .order('expiry_date');
    if (error) throw error;
    return (data ?? []) as InventoryWithRelations[];
  });
}

export async function fetchInventoryByHospital(hospitalId: string): Promise<InventoryWithRelations[]> {
  return retry(async () => {
    const { data, error } = await supabase
      .from('inventory_batches')
      .select('*, hospital: hospitals(*), sku: skus(*)')
      .eq('hospital_id', hospitalId)
      .order('expiry_date');
    if (error) throw error;
    return (data ?? []) as InventoryWithRelations[];
  });
}

export async function addInventoryBatch(batch: {
  hospital_id: string;
  sku_id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  unit_cost: number;
  daily_run_rate: number;
}): Promise<void> {
  const { data, error } = await supabase.from('inventory_batches').insert(batch).select().single();
  if (error) throw error;
  await logAudit({
    hospital_id: batch.hospital_id,
    action: 'inventory.add',
    table_name: 'inventory_batches',
    record_id: data?.id,
    details: { batch_number: batch.batch_number, quantity: batch.quantity, sku_id: batch.sku_id },
  });
  await createNotification({
    hospital_id: batch.hospital_id,
    event_type: 'inventory_added',
    title: 'New inventory batch added',
    message: `Batch ${batch.batch_number} with ${batch.quantity} units added.`,
  });
}

// ---- Stockout Requests ----

export interface StockoutWithRelations extends StockoutRequest {
  hospital: Hospital;
  sku: Sku;
}

export async function fetchOpenStockouts(): Promise<StockoutWithRelations[]> {
  return retry(async () => {
    const { data, error } = await supabase
      .from('stockout_requests')
      .select('*, hospital: hospitals(*), sku: skus(*)')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as StockoutWithRelations[];
  });
}

export async function fetchAllStockouts(): Promise<StockoutWithRelations[]> {
  const { data, error } = await supabase
    .from('stockout_requests')
    .select('*, hospital: hospitals(*), sku: skus(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StockoutWithRelations[];
}

export async function createStockoutRequest(request: {
  hospital_id: string;
  sku_id: string;
  quantity_needed: number;
  urgency: Urgency;
}): Promise<void> {
  const { data, error } = await supabase.from('stockout_requests').insert({
    ...request,
    status: 'open',
  }).select().single();
  if (error) throw error;
  await logAudit({
    hospital_id: request.hospital_id,
    action: 'stockout.report',
    table_name: 'stockout_requests',
    record_id: data?.id,
    details: { quantity_needed: request.quantity_needed, urgency: request.urgency, sku_id: request.sku_id },
  });
  await createNotification({
    hospital_id: request.hospital_id,
    event_type: 'stockout_reported',
    title: 'Stockout reported',
    message: `Shortage of ${request.quantity_needed} units reported with ${request.urgency} urgency.`,
  });
}

// ---- Transfers ----

export interface TransferWithRelations extends Transfer {
  from_hospital: Hospital;
  to_hospital: Hospital;
  sku: Sku;
  batch: InventoryBatch;
}

export async function fetchAllTransfers(): Promise<TransferWithRelations[]> {
  return retry(async () => {
    const { data, error } = await supabase
      .from('transfers')
      .select('*, from_hospital: hospitals!from_hospital_id(*), to_hospital: hospitals!to_hospital_id(*), sku: skus(*), batch: inventory_batches(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TransferWithRelations[];
  });
}

export async function createTransfers(
  transfers: Array<{
    from_hospital_id: string;
    to_hospital_id: string;
    batch_id: string;
    sku_id: string;
    quantity: number;
    status: string;
    distance_km: number;
    transfer_cost: number;
  }>
): Promise<void> {
  const { data, error } = await supabase.from('transfers').insert(transfers).select();
  if (error) throw error;
  for (const t of transfers) {
    await logAudit({
      hospital_id: t.from_hospital_id,
      action: 'transfer.create',
      table_name: 'transfers',
      details: { from: t.from_hospital_id, to: t.to_hospital_id, quantity: t.quantity, sku_id: t.sku_id },
    });
    await createNotification({
      hospital_id: t.from_hospital_id,
      event_type: 'transfer_created',
      title: 'Transfer dispatched',
      message: `${t.quantity} units sent to destination hospital (${t.distance_km} km).`,
    });
    await createNotification({
      hospital_id: t.to_hospital_id,
      event_type: 'transfer_incoming',
      title: 'Incoming transfer',
      message: `${t.quantity} units incoming from source hospital.`,
    });
  }
}

export async function updateTransferStatus(
  transferId: string,
  status: 'in_transit' | 'completed' | 'cancelled'
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === 'completed') update.completed_at = new Date().toISOString();
  const { error } = await supabase.from('transfers').update(update).eq('id', transferId);
  if (error) throw error;
  await logAudit({
    action: `transfer.${status}`,
    table_name: 'transfers',
    record_id: transferId,
    details: { status },
  });
}

// ---- Transactions ----

export interface TransactionWithRelations extends Transaction {
  transfer: Transfer & { from_hospital: Hospital; to_hospital: Hospital; sku: Sku };
}

export async function fetchAllTransactions(): Promise<TransactionWithRelations[]> {
  return retry(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, transfer: transfers(*, from_hospital: hospitals!from_hospital_id(*), to_hospital: hospitals!to_hospital_id(*), sku: skus(*))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TransactionWithRelations[];
  });
}

export async function createTransaction(transaction: {
  transfer_id: string;
  total_batch_value: number;
  platform_fee: number;
  waste_cost_prevented: number;
}): Promise<void> {
  const { data, error } = await supabase.from('transactions').insert(transaction).select().single();
  if (error) throw error;
  await logAudit({
    action: 'transaction.settle',
    table_name: 'transactions',
    record_id: data?.id,
    details: { transfer_id: transaction.transfer_id, total_batch_value: transaction.total_batch_value, platform_fee: transaction.platform_fee },
  });
}

// ---- Reset Demo Data ----

export async function resetDemoData(): Promise<void> {
  // Delete in dependency order (child tables first)
  const tables = ['transactions', 'transfers', 'stockout_requests', 'inventory_batches'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  }

  // Re-seed hospitals
  const hospitals = [
    { id: 'a1000000-0000-0000-0000-000000000001', name: 'Lifeline General Hospital', address: 'Marathon Pkwy, Andheri E, Mumbai', lat: 19.1136, lng: 72.8696, type: 'hospital' },
    { id: 'a1000000-0000-0000-0000-000000000002', name: 'MetroCare Medical Center', address: 'Linking Rd, Bandra W, Mumbai', lat: 19.0596, lng: 72.8295, type: 'hospital' },
    { id: 'a1000000-0000-0000-0000-000000000003', name: 'Sunrise Childrens Hospital', address: 'Palm Beach Rd, Nerul, Navi Mumbai', lat: 19.033, lng: 73.0117, type: 'hospital' },
    { id: 'a1000000-0000-0000-0000-000000000004', name: 'Fortis Heart Institute', address: 'Mulund-Goregaon Link Rd, Mulund W, Mumbai', lat: 19.1727, lng: 72.9455, type: 'hospital' },
    { id: 'a1000000-0000-0000-0000-000000000005', name: 'Unity Multispecialty Hospital', address: 'Eastern Express Hwy, Vikhroli E, Mumbai', lat: 19.1167, lng: 72.926, type: 'hospital' },
  ];
  const { error: hErr } = await supabase.from('hospitals').upsert(hospitals, { onConflict: 'id' });
  if (hErr) throw hErr;

  // Re-seed SKUs
  const skus = [
    { id: 'b2000000-0000-0000-0000-000000000001', name: 'Polyvalent Antivenom', category: 'Antivenom', unit_cost: 1850.00, cold_chain_required: true, default_daily_run_rate: 3 },
    { id: 'b2000000-0000-0000-0000-000000000002', name: 'IVIG (Intravenous Immunoglobulin)', category: 'Immunoglobulin', unit_cost: 12500.00, cold_chain_required: true, default_daily_run_rate: 2 },
    { id: 'b2000000-0000-0000-0000-000000000003', name: 'Albumin 20%', category: 'Plasma Protein', unit_cost: 3200.00, cold_chain_required: true, default_daily_run_rate: 4 },
    { id: 'b2000000-0000-0000-0000-000000000004', name: 'Remdesivir', category: 'Antiviral', unit_cost: 2800.00, cold_chain_required: true, default_daily_run_rate: 5 },
    { id: 'b2000000-0000-0000-0000-000000000005', name: 'Factor VIII', category: 'Clotting Factor', unit_cost: 9500.00, cold_chain_required: true, default_daily_run_rate: 2 },
    { id: 'b2000000-0000-0000-0000-000000000006', name: 'Heparin Sodium', category: 'Anticoagulant', unit_cost: 450.00, cold_chain_required: false, default_daily_run_rate: 8 },
    { id: 'b2000000-0000-0000-0000-000000000007', name: 'Insulin Glargine', category: 'Insulin', unit_cost: 850.00, cold_chain_required: true, default_daily_run_rate: 6 },
    { id: 'b2000000-0000-0000-0000-000000000008', name: 'Amoxicillin IV', category: 'Antibiotic', unit_cost: 120.00, cold_chain_required: false, default_daily_run_rate: 10 },
    { id: 'b2000000-0000-0000-0000-000000000009', name: 'Dopamine HCl', category: 'Vasopressor', unit_cost: 620.00, cold_chain_required: false, default_daily_run_rate: 4 },
    { id: 'b2000000-0000-0000-0000-000000000010', name: 'Midazolam', category: 'Sedative', unit_cost: 95.00, cold_chain_required: false, default_daily_run_rate: 7 },
    { id: 'b2000000-0000-0000-0000-000000000011', name: 'Oxytocin', category: 'Hormone', unit_cost: 180.00, cold_chain_required: true, default_daily_run_rate: 5 },
    { id: 'b2000000-0000-0000-0000-000000000012', name: 'Rabies Immunoglobulin', category: 'Immunoglobulin', unit_cost: 2100.00, cold_chain_required: true, default_daily_run_rate: 2 },
    { id: 'b2000000-0000-0000-0000-000000000013', name: 'Suxamethonium Chloride', category: 'Muscle Relaxant', unit_cost: 350.00, cold_chain_required: false, default_daily_run_rate: 4 },
    { id: 'b2000000-0000-0000-0000-000000000014', name: 'Packed Red Blood Cells', category: 'Blood Product', unit_cost: 1500.00, cold_chain_required: true, default_daily_run_rate: 3 },
    { id: 'b2000000-0000-0000-0000-000000000015', name: 'Furosemide', category: 'Diuretic', unit_cost: 75.00, cold_chain_required: false, default_daily_run_rate: 9 },
  ];
  const { error: sErr } = await supabase.from('skus').upsert(skus, { onConflict: 'id' });
  if (sErr) throw sErr;

  // Re-seed inventory batches
  const batches = [
    { id: 'c3000000-0000-0000-0000-000000000001', hospital_id: 'a1000000-0000-0000-0000-000000000001', sku_id: 'b2000000-0000-0000-0000-000000000001', batch_number: 'AVN-2026A', quantity: 120, expiry_date: '2026-10-15', unit_cost: 1850.00, daily_run_rate: 3, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000002', hospital_id: 'a1000000-0000-0000-0000-000000000001', sku_id: 'b2000000-0000-0000-0000-000000000003', batch_number: 'ALB-2026B', quantity: 200, expiry_date: '2026-10-20', unit_cost: 3200.00, daily_run_rate: 4, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000003', hospital_id: 'a1000000-0000-0000-0000-000000000001', sku_id: 'b2000000-0000-0000-0000-000000000006', batch_number: 'HEP-2026C', quantity: 500, expiry_date: '2027-01-10', unit_cost: 450.00, daily_run_rate: 8, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000004', hospital_id: 'a1000000-0000-0000-0000-000000000001', sku_id: 'b2000000-0000-0000-0000-000000000008', batch_number: 'AMX-2026D', quantity: 300, expiry_date: '2026-09-25', unit_cost: 120.00, daily_run_rate: 10, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000005', hospital_id: 'a1000000-0000-0000-0000-000000000001', sku_id: 'b2000000-0000-0000-0000-000000000010', batch_number: 'MDZ-2026E', quantity: 250, expiry_date: '2026-11-30', unit_cost: 95.00, daily_run_rate: 7, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000006', hospital_id: 'a1000000-0000-0000-0000-000000000002', sku_id: 'b2000000-0000-0000-0000-000000000002', batch_number: 'IVIG-2026F', quantity: 80, expiry_date: '2026-10-10', unit_cost: 12500.00, daily_run_rate: 2, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000007', hospital_id: 'a1000000-0000-0000-0000-000000000002', sku_id: 'b2000000-0000-0000-0000-000000000004', batch_number: 'REM-2026G', quantity: 150, expiry_date: '2026-09-30', unit_cost: 2800.00, daily_run_rate: 5, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000008', hospital_id: 'a1000000-0000-0000-0000-000000000002', sku_id: 'b2000000-0000-0000-0000-000000000005', batch_number: 'F8-2026H', quantity: 60, expiry_date: '2026-11-15', unit_cost: 9500.00, daily_run_rate: 2, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000009', hospital_id: 'a1000000-0000-0000-0000-000000000002', sku_id: 'b2000000-0000-0000-0000-000000000007', batch_number: 'INS-2026I', quantity: 300, expiry_date: '2026-12-01', unit_cost: 850.00, daily_run_rate: 6, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000010', hospital_id: 'a1000000-0000-0000-0000-000000000002', sku_id: 'b2000000-0000-0000-0000-000000000012', batch_number: 'RIG-2026J', quantity: 90, expiry_date: '2026-10-05', unit_cost: 2100.00, daily_run_rate: 2, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000011', hospital_id: 'a1000000-0000-0000-0000-000000000003', sku_id: 'b2000000-0000-0000-0000-000000000001', batch_number: 'AVN-2026K', quantity: 40, expiry_date: '2026-09-20', unit_cost: 1850.00, daily_run_rate: 3, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000012', hospital_id: 'a1000000-0000-0000-0000-000000000003', sku_id: 'b2000000-0000-0000-0000-000000000003', batch_number: 'ALB-2026L', quantity: 180, expiry_date: '2026-12-15', unit_cost: 3200.00, daily_run_rate: 4, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000013', hospital_id: 'a1000000-0000-0000-0000-000000000003', sku_id: 'b2000000-0000-0000-0000-000000000011', batch_number: 'OXY-2026M', quantity: 220, expiry_date: '2026-10-08', unit_cost: 180.00, daily_run_rate: 5, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000014', hospital_id: 'a1000000-0000-0000-0000-000000000003', sku_id: 'b2000000-0000-0000-0000-000000000014', batch_number: 'PRBC-2026N', quantity: 100, expiry_date: '2026-09-18', unit_cost: 1500.00, daily_run_rate: 3, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000015', hospital_id: 'a1000000-0000-0000-0000-000000000003', sku_id: 'b2000000-0000-0000-0000-000000000009', batch_number: 'DOP-2026O', quantity: 160, expiry_date: '2027-02-20', unit_cost: 620.00, daily_run_rate: 4, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000016', hospital_id: 'a1000000-0000-0000-0000-000000000004', sku_id: 'b2000000-0000-0000-0000-000000000005', batch_number: 'F8-2026P', quantity: 110, expiry_date: '2026-10-12', unit_cost: 9500.00, daily_run_rate: 2, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000017', hospital_id: 'a1000000-0000-0000-0000-000000000004', sku_id: 'b2000000-0000-0000-0000-000000000009', batch_number: 'DOP-2026Q', quantity: 350, expiry_date: '2026-11-05', unit_cost: 620.00, daily_run_rate: 4, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000018', hospital_id: 'a1000000-0000-0000-0000-000000000004', sku_id: 'b2000000-0000-0000-0000-000000000013', batch_number: 'SUX-2026R', quantity: 280, expiry_date: '2026-09-22', unit_cost: 350.00, daily_run_rate: 4, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000019', hospital_id: 'a1000000-0000-0000-0000-000000000004', sku_id: 'b2000000-0000-0000-0000-000000000015', batch_number: 'FUR-2026S', quantity: 400, expiry_date: '2026-10-25', unit_cost: 75.00, daily_run_rate: 9, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000020', hospital_id: 'a1000000-0000-0000-0000-000000000004', sku_id: 'b2000000-0000-0000-0000-000000000006', batch_number: 'HEP-2026T', quantity: 600, expiry_date: '2027-03-15', unit_cost: 450.00, daily_run_rate: 8, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000021', hospital_id: 'a1000000-0000-0000-0000-000000000005', sku_id: 'b2000000-0000-0000-0000-000000000004', batch_number: 'REM-2026U', quantity: 180, expiry_date: '2026-10-02', unit_cost: 2800.00, daily_run_rate: 5, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000022', hospital_id: 'a1000000-0000-0000-0000-000000000005', sku_id: 'b2000000-0000-0000-0000-000000000002', batch_number: 'IVIG-2026V', quantity: 50, expiry_date: '2026-09-28', unit_cost: 12500.00, daily_run_rate: 2, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000023', hospital_id: 'a1000000-0000-0000-0000-000000000005', sku_id: 'b2000000-0000-0000-0000-000000000008', batch_number: 'AMX-2026W', quantity: 350, expiry_date: '2026-12-10', unit_cost: 120.00, daily_run_rate: 10, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000024', hospital_id: 'a1000000-0000-0000-0000-000000000005', sku_id: 'b2000000-0000-0000-0000-000000000010', batch_number: 'MDZ-2026X', quantity: 180, expiry_date: '2026-09-15', unit_cost: 95.00, daily_run_rate: 7, status: 'active' },
    { id: 'c3000000-0000-0000-0000-000000000025', hospital_id: 'a1000000-0000-0000-0000-000000000005', sku_id: 'b2000000-0000-0000-0000-000000000007', batch_number: 'INS-2026Y', quantity: 260, expiry_date: '2026-11-20', unit_cost: 850.00, daily_run_rate: 6, status: 'active' },
  ];
  const { error: bErr } = await supabase.from('inventory_batches').upsert(batches, { onConflict: 'id' });
  if (bErr) throw bErr;

  // Re-seed stockout requests
  const stockouts = [
    { id: 'd4000000-0000-0000-0000-000000000001', hospital_id: 'a1000000-0000-0000-0000-000000000003', sku_id: 'b2000000-0000-0000-0000-000000000001', quantity_needed: 50, urgency: 'emergency', status: 'open' },
    { id: 'd4000000-0000-0000-0000-000000000002', hospital_id: 'a1000000-0000-0000-0000-000000000005', sku_id: 'b2000000-0000-0000-0000-000000000002', quantity_needed: 30, urgency: 'urgent', status: 'open' },
    { id: 'd4000000-0000-0000-0000-000000000003', hospital_id: 'a1000000-0000-0000-0000-000000000004', sku_id: 'b2000000-0000-0000-0000-000000000004', quantity_needed: 40, urgency: 'routine', status: 'open' },
  ];
  const { error: soErr } = await supabase.from('stockout_requests').upsert(stockouts, { onConflict: 'id' });
  if (soErr) throw soErr;

  // Re-seed hospital_users link for the demo network_admin account
  const demoUserLink = {
    user_id: 'e1000000-0000-0000-0000-000000000001',
    hospital_id: 'a1000000-0000-0000-0000-000000000001',
    role: 'network_admin',
  };
  const { error: huErr } = await supabase.from('hospital_users').upsert(demoUserLink, { onConflict: 'user_id,hospital_id' });
  if (huErr) throw huErr;
}

/**
 * Complete a transfer: set status to 'completed', decrement the source batch
 * quantity, and record a settlement transaction in the ledger.
 */
export async function completeTransfer(transferId: string): Promise<void> {
  // 1. Fetch the transfer with batch info
  const { data: transfer, error: tfError } = await supabase
    .from('transfers')
    .select('*, batch: inventory_batches(*)')
    .eq('id', transferId)
    .maybeSingle();
  if (tfError) throw tfError;
  if (!transfer) throw new Error('Transfer not found');

  // 2. Update transfer status
  await updateTransferStatus(transferId, 'completed');

  // 3. Decrement batch quantity
  const newQty = (transfer.batch as InventoryBatch).quantity - transfer.quantity;
  const { error: batchError } = await supabase
    .from('inventory_batches')
    .update({ quantity: Math.max(0, newQty) })
    .eq('id', transfer.batch_id);
  if (batchError) throw batchError;

  // 4. Record settlement transaction
  const { computeSettlement } = await import('./settlement');
  const settlement = computeSettlement(transfer.quantity, (transfer.batch as InventoryBatch).unit_cost);
  await createTransaction({ transfer_id: transferId, ...settlement });

  // 5. Create notifications for both hospitals
  await createNotification({
    hospital_id: transfer.from_hospital_id,
    event_type: 'transfer_completed',
    title: 'Transfer completed',
    message: `${transfer.quantity} units successfully delivered. Settlement recorded.`,
  });
  await createNotification({
    hospital_id: transfer.to_hospital_id,
    event_type: 'transfer_received',
    title: 'Transfer received',
    message: `${transfer.quantity} units received and added to inventory.`,
  });
}

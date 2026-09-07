/**
 * Surplus / Expiry Detection Engine
 *
 * For every inventory batch, computes:
 *   Days_to_Expiry      = Expiry_Date − Today
 *   Expected_Consumption = Daily_Run_Rate × Days_to_Expiry
 *   Surplus              = Current_Stock − Expected_Consumption
 *
 * If Surplus > 0 the batch is flagged "At-Risk Surplus" and made available
 * for rebalancing.
 */

import type { InventoryBatch, SurplusResult } from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function computeSurplus(batch: InventoryBatch, today: Date = new Date()): SurplusResult {
  const expiry = new Date(batch.expiry_date);
  const daysToExpiry = Math.max(0, Math.ceil((expiry.getTime() - today.getTime()) / MS_PER_DAY));
  const expectedConsumption = batch.daily_run_rate * daysToExpiry;
  const surplus = batch.quantity - expectedConsumption;

  return {
    batch_id: batch.id,
    hospital_id: batch.hospital_id,
    sku_id: batch.sku_id,
    batch_number: batch.batch_number,
    quantity: batch.quantity,
    expiry_date: batch.expiry_date,
    unit_cost: batch.unit_cost,
    daily_run_rate: batch.daily_run_rate,
    days_to_expiry: daysToExpiry,
    expected_consumption: expectedConsumption,
    surplus,
    is_at_risk: surplus > 0,
  };
}

export function detectAllSurplus(batches: InventoryBatch[], today: Date = new Date()): SurplusResult[] {
  return batches.map((b) => computeSurplus(b, today));
}

export function getAtRiskSurplus(batches: InventoryBatch[], today: Date = new Date()): SurplusResult[] {
  return detectAllSurplus(batches, today).filter((s) => s.is_at_risk);
}

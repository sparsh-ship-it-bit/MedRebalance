/**
 * Rebalancing Algorithm — Greedy Min-Cost Bipartite Matching
 *
 * When a hospital reports a shortage with an Urgency Level (routine/urgent/emergency):
 *   1. Find all facilities with active At-Risk Surplus for that SKU.
 *   2. Cost = (Distance_km × 1.5) + Cold_Chain_Fee − (Urgency_Weight × 50)
 *      using Haversine distance between hospital lat/lng.
 *   3. Compute an allocation that minimizes total cost while preventing the same
 *      batch from being assigned to multiple requesters.
 *
 * The algorithm is a greedy approximation of min-cost bipartite matching:
 *   - Build a list of (request, surplus-batch) candidate pairs with their cost.
 *   - Sort ascending by cost (cheapest first).
 *   - Greedily assign, decrementing remaining surplus and remaining need,
 *     skipping batches whose surplus has been exhausted.
 *
 * This module is pure — no I/O, no UI. It takes typed inputs and returns typed
 * outputs so it can be unit-tested in isolation.
 */

import { haversineKm } from './haversine';
import type {
  Allocation,
  Hospital,
  RebalanceResult,
  StockoutRequest,
  SurplusResult,
  Urgency,
} from './types';

const URGENCY_WEIGHT: Record<Urgency, number> = {
  routine: 1,
  urgent: 2,
  emergency: 3,
};

const COLD_CHAIN_FEE = 200;
const DISTANCE_RATE = 1.5;
const URGENCY_DISCOUNT = 50;

export interface RebalanceInput {
  requests: StockoutRequest[];
  surplusBatches: SurplusResult[];
  hospitals: Hospital[];
  skuColdChain: Record<string, boolean>;
}

interface Candidate {
  request: StockoutRequest;
  batch: SurplusResult;
  distanceKm: number;
  cost: number;
}

function hospitalMap(hospitals: Hospital[]): Map<string, Hospital> {
  return new Map(hospitals.map((h) => [h.id, h]));
}

function computeCost(
  distanceKm: number,
  coldChain: boolean,
  urgency: Urgency
): number {
  const coldFee = coldChain ? COLD_CHAIN_FEE : 0;
  const urgencyDiscount = URGENCY_WEIGHT[urgency] * URGENCY_DISCOUNT;
  return Math.round((distanceKm * DISTANCE_RATE + coldFee - urgencyDiscount) * 100) / 100;
}

function buildCandidates(input: RebalanceInput, hMap: Map<string, Hospital>): Candidate[] {
  const candidates: Candidate[] = [];

  for (const request of input.requests) {
    if (request.status !== 'open') continue;
    const toHospital = hMap.get(request.hospital_id);
    if (!toHospital) continue;

    const matchingSurplus = input.surplusBatches.filter(
      (s) =>
        s.sku_id === request.sku_id &&
        s.hospital_id !== request.hospital_id &&
        s.surplus > 0
    );

    for (const batch of matchingSurplus) {
      const fromHospital = hMap.get(batch.hospital_id);
      if (!fromHospital) continue;

      const distanceKm = haversineKm(
        fromHospital.lat,
        fromHospital.lng,
        toHospital.lat,
        toHospital.lng
      );

      const coldChain = input.skuColdChain[request.sku_id] ?? false;
      const cost = computeCost(distanceKm, coldChain, request.urgency);

      candidates.push({ request, batch, distanceKm, cost });
    }
  }

  return candidates;
}

/**
 * Main entry point: compute the optimal allocation of surplus batches to
 * stockout requests, minimizing total transfer cost.
 */
export function rebalance(input: RebalanceInput): RebalanceResult {
  const hMap = hospitalMap(input.hospitals);
  const candidates = buildCandidates(input, hMap);

  // Sort cheapest-first for greedy assignment
  candidates.sort((a, b) => a.cost - b.cost);

  // Track remaining surplus per batch and remaining need per request
  const remainingSurplus = new Map<string, number>();
  for (const s of input.surplusBatches) {
    if (s.surplus > 0) remainingSurplus.set(s.batch_id, s.surplus);
  }

  const remainingNeed = new Map<string, number>();
  for (const r of input.requests) {
    if (r.status === 'open') remainingNeed.set(r.id, r.quantity_needed);
  }

  const usedBatchIds = new Set<string>();
  const allocations: Allocation[] = [];
  let totalCost = 0;

  for (const c of candidates) {
    const need = remainingNeed.get(c.request.id);
    if (need === undefined || need <= 0) continue;

    const surplus = remainingSurplus.get(c.batch.batch_id);
    if (surplus === undefined || surplus <= 0) continue;

    // A batch can only go to ONE requester (bipartite matching constraint)
    if (usedBatchIds.has(c.batch.batch_id)) continue;
    usedBatchIds.add(c.batch.batch_id);

    const allocated = Math.min(need, surplus);
    remainingSurplus.set(c.batch.batch_id, surplus - allocated);
    remainingNeed.set(c.request.id, need - allocated);
    totalCost += c.cost;

    allocations.push({
      batch_id: c.batch.batch_id,
      from_hospital_id: c.batch.hospital_id,
      to_hospital_id: c.request.hospital_id,
      sku_id: c.request.sku_id,
      quantity: allocated,
      distance_km: c.distanceKm,
      cost: c.cost,
      urgency: c.request.urgency,
      batch_number: c.batch.batch_number,
    });
  }

  // Collect unfulfilled requests
  const unfulfilled: RebalanceResult['unfulfilled'] = [];
  for (const [requestId, need] of remainingNeed) {
    if (need > 0) {
      const request = input.requests.find((r) => r.id === requestId);
      unfulfilled.push({
        request_id: requestId,
        sku_id: request?.sku_id ?? '',
        quantity_remaining: need,
      });
    }
  }

  return {
    allocations,
    total_cost: Math.round(totalCost * 100) / 100,
    unfulfilled,
  };
}

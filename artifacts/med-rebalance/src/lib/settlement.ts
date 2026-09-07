/**
 * Transaction Settlement
 *
 * On every completed transfer:
 *   Total_Batch_Value    = Transferred_Qty × Unit_Price
 *   Platform_Fee         = 3.5% of Total_Batch_Value
 *   Waste_Cost_Prevented = Total_Batch_Value
 */

export const PLATFORM_FEE_RATE = 0.035;

export interface SettlementResult {
  total_batch_value: number;
  platform_fee: number;
  waste_cost_prevented: number;
}

export function computeSettlement(
  transferredQty: number,
  unitPrice: number
): SettlementResult {
  const totalBatchValue = Math.round(transferredQty * unitPrice * 100) / 100;
  const platformFee = Math.round(totalBatchValue * PLATFORM_FEE_RATE * 100) / 100;
  const wasteCostPrevented = totalBatchValue;

  return {
    total_batch_value: totalBatchValue,
    platform_fee: platformFee,
    waste_cost_prevented: wasteCostPrevented,
  };
}

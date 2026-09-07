export interface Hospital {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
}

export interface Sku {
  id: string;
  name: string;
  category: string;
  unit_cost: number;
  cold_chain_required: boolean;
  default_daily_run_rate: number;
}

export interface InventoryBatch {
  id: string;
  hospital_id: string;
  sku_id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  unit_cost: number;
  daily_run_rate: number;
  status: string;
  hospital?: Hospital;
  sku?: Sku;
}

export type Urgency = 'routine' | 'urgent' | 'emergency';

export interface StockoutRequest {
  id: string;
  hospital_id: string;
  sku_id: string;
  quantity_needed: number;
  urgency: Urgency;
  status: 'open' | 'fulfilled' | 'cancelled';
  created_at: string;
  hospital?: Hospital;
  sku?: Sku;
}

export type TransferStatus = 'suggested' | 'in_transit' | 'completed' | 'cancelled';

export interface Transfer {
  id: string;
  from_hospital_id: string;
  to_hospital_id: string;
  batch_id: string;
  sku_id: string;
  quantity: number;
  status: TransferStatus;
  distance_km: number;
  transfer_cost: number;
  created_at: string;
  completed_at: string | null;
  from_hospital?: Hospital;
  to_hospital?: Hospital;
  batch?: InventoryBatch;
  sku?: Sku;
}

export interface Transaction {
  id: string;
  transfer_id: string;
  total_batch_value: number;
  platform_fee: number;
  waste_cost_prevented: number;
  created_at: string;
  transfer?: Transfer;
}

export interface SurplusResult {
  batch_id: string;
  hospital_id: string;
  sku_id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  unit_cost: number;
  daily_run_rate: number;
  days_to_expiry: number;
  expected_consumption: number;
  surplus: number;
  is_at_risk: boolean;
}

export interface Allocation {
  batch_id: string;
  from_hospital_id: string;
  to_hospital_id: string;
  sku_id: string;
  quantity: number;
  distance_km: number;
  cost: number;
  urgency: Urgency;
  batch_number: string;
}

export interface RebalanceResult {
  allocations: Allocation[];
  total_cost: number;
  unfulfilled: { request_id: string; sku_id: string; quantity_remaining: number }[];
}

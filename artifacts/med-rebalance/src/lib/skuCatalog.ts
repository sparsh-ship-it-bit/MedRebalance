import { supabase } from './supabase';
import type { Sku } from './types';

export async function createSku(input: {
  name: string;
  category?: string;
  unit_cost?: number;
  cold_chain_required?: boolean;
  default_daily_run_rate?: number;
}): Promise<Sku> {
  const name = input.name.trim();
  if (!name) throw new Error('Medicine name is required');

  const { data, error } = await supabase
    .from('skus')
    .insert({
      name,
      category: input.category?.trim() || 'General Medicine',
      unit_cost: input.unit_cost ?? 0,
      cold_chain_required: input.cold_chain_required ?? false,
      default_daily_run_rate: input.default_daily_run_rate ?? 1,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Sku;
}

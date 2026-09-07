/*
 * billing.ts — Stripe billing integration layer.
 *
 * Role in the architecture:
 *   Manages the two revenue streams: (1) a monthly SaaS subscription per
 *   hospital and (2) the 3.5% platform fee per completed transfer. Uses
 *   Stripe Checkout for subscription setup and records billing status in
 *   the `hospital_billing` table. When Stripe is not configured (no
 *   VITE_STRIPE_PUBLISHABLE_KEY), all functions return a "not configured"
 *   state so the UI can show a setup prompt instead of crashing.
 *
 *   To activate: add VITE_STRIPE_PUBLISHABLE_KEY to .env and set the
 *   STRIPE_SECRET_KEY edge function secret. The Billing tab will then
 *   show a "Set up subscription" button that redirects to Stripe Checkout.
 */

import { supabase } from './supabase';
import { retry } from './retry';

export interface HospitalBilling {
  hospital_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: 'none' | 'active' | 'past_due' | 'canceled';
  subscription_amount: number;
  current_period_end: string | null;
}

export function isStripeConfigured(): boolean {
  return !!import.meta.env.VITE_STRIPE_PRICE_ID;
}

export async function fetchBillingStatus(hospitalId: string): Promise<HospitalBilling> {
  const { data, error } = await retry(() => supabase
    .from('hospital_billing')
    .select('*')
    .eq('hospital_id', hospitalId)
    .maybeSingle());

  if (error) throw error;

  if (!data) {
    return {
      hospital_id: hospitalId,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: 'none',
      subscription_amount: 0,
      current_period_end: null,
    };
  }

  return data as HospitalBilling;
}

export async function fetchAllBillingStatuses(): Promise<HospitalBilling[]> {
  const { data, error } = await retry(() => supabase
    .from('hospital_billing')
    .select('*'));

  if (error) throw error;
  return (data ?? []) as HospitalBilling[];
}

export async function startSubscription(hospitalId: string, hospitalName: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;

  const { data, error } = await retry(() => supabase.functions.invoke('create-checkout-session', {
    body: { hospital_id: hospitalId, hospital_name: hospitalName },
  }));

  if (error) throw error;
  return data?.url ?? null;
}

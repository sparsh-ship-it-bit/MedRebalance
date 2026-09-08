import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Global realtime bridge. Components that are not yet using a dedicated
// subscription can still stay synchronized without polling: a database change
// causes the current application to refresh from Supabase's source of truth.
// This is intentionally browser-only and never exposes credentials.
if (typeof window !== 'undefined') {
  const realtimeChannel = supabase
    .channel('medrebalance-live-data')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batches' }, () => window.dispatchEvent(new Event('medrebalance:data-changed')))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stockout_requests' }, () => window.dispatchEvent(new Event('medrebalance:data-changed')))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, () => window.dispatchEvent(new Event('medrebalance:data-changed')))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => window.dispatchEvent(new Event('medrebalance:data-changed')))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_events' }, () => window.dispatchEvent(new Event('medrebalance:notification-changed')))
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') console.error('MedRebalance realtime subscription failed');
    });

  window.addEventListener('beforeunload', () => {
    void supabase.removeChannel(realtimeChannel);
  }, { once: true });
}

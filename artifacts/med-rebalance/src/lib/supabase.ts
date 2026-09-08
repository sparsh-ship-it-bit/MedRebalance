import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Browser-wide realtime bridge. Supabase remains the source of truth; a
// database event invalidates the current UI so dashboards cannot go stale.
// The refresh is debounced because one business action can emit several rows.
if (typeof window !== 'undefined') {
  let refreshTimer: number | undefined;

  const refreshFromRealtime = () => {
    if (document.visibilityState !== 'visible') return;
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      window.location.reload();
    }, 350);
  };

  const realtimeChannel = supabase
    .channel('medrebalance-live-data')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batches' }, refreshFromRealtime)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stockout_requests' }, refreshFromRealtime)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, refreshFromRealtime)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, refreshFromRealtime)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_events' }, refreshFromRealtime)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('MedRebalance realtime subscription failed');
      }
    });

  window.addEventListener('beforeunload', () => {
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    void supabase.removeChannel(realtimeChannel);
  }, { once: true });
}

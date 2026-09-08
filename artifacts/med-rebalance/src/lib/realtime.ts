import { useEffect } from 'react';
import { supabase } from './supabase';

export type RealtimeTable =
  | 'hospitals'
  | 'inventory_batches'
  | 'stockout_requests'
  | 'transfers'
  | 'transactions'
  | 'notification_events';

/**
 * Subscribe to live Postgres changes and trigger a refetch when relevant data changes.
 * This keeps dashboards authoritative: Supabase remains the source of truth and
 * realtime events only invalidate local data rather than attempting to merge partial rows.
 */
export function useRealtimeRefresh(
  channelName: string,
  tables: RealtimeTable[],
  onChange: () => void | Promise<void>,
) {
  useEffect(() => {
    let active = true;
    const channel = supabase.channel(channelName);

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          if (active) void onChange();
        },
      );
    }

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error(`Realtime channel ${channelName} failed to subscribe`);
      }
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [channelName, onChange, tables.join(',')]);
}

/*
 * notifications.ts — In-app notification system.
 *
 * Role in the architecture:
 *   Manages notification_events in Supabase — creating events when key things
 *   happen (surplus flagged, stockout matched, transfer status changed) and
 *   fetching them for the notification bell in the header. Each notification
 *   is scoped to a hospital so users only see their own hospital's events.
 *   network_admin sees all hospitals' notifications.
 */

import { supabase } from './supabase';
import { retry } from './retry';

export interface NotificationEvent {
  id: string;
  hospital_id: string;
  event_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function createNotification(event: {
  hospital_id: string;
  event_type: string;
  title: string;
  message: string;
  source_key?: string;
}): Promise<void> {
  try {
    const { error } = await retry(() => supabase
      .from('notification_events')
      .upsert(event, { onConflict: 'hospital_id,event_type,source_key', ignoreDuplicates: true }));
    if (error) throw error;
    await retry(() => supabase.functions.invoke('send-notification-email', {
      body: event,
    }));
  } catch (error) {
    console.error('Failed to create or email notification:', error);
  }
}

export async function fetchNotifications(
  hospitalId: string,
  isNetworkAdmin: boolean
): Promise<NotificationEvent[]> {
  let query = supabase
    .from('notification_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!isNetworkAdmin) {
    query = query.eq('hospital_id', hospitalId);
  }

  try {
    const { data, error } = await retry(() => query);
    if (error) throw error;
    return (data ?? []) as NotificationEvent[];
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unable to load notifications.');
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await retry(() => supabase
    .from('notification_events')
    .update({ is_read: true })
    .eq('id', id));
  if (error) throw error;
}

export async function markAllNotificationsRead(hospitalId: string, isNetworkAdmin: boolean): Promise<void> {
  let query = supabase
    .from('notification_events')
    .update({ is_read: true })
    .eq('is_read', false);

  if (!isNetworkAdmin) {
    query = query.eq('hospital_id', hospitalId);
  }

  const { error } = await retry(() => query);
  if (error) throw error;
}

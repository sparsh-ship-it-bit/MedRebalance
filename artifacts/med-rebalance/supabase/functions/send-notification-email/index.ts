import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type NotificationPayload = {
  hospital_id: string;
  event_type: string;
  title: string;
  message: string;
};

async function sendEmail(to: string[], subject: string, text: string) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
  const from = Deno.env.get('NOTIFICATION_FROM_EMAIL');
  if (!from || (!resendKey && !sendgridKey)) throw new Error('Email notifications are not configured.');
  if (resendKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!response.ok) throw new Error(`Resend rejected the notification (${response.status}).`);
    return;
  }
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ personalizations: [{ to: to.map((email) => ({ email })) }], from: { email: from }, subject, content: [{ type: 'text/plain', value: text }] }),
  });
  if (!response.ok) throw new Error(`SendGrid rejected the notification (${response.status}).`);
}

Deno.serve(async (request) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = request.headers.get('Authorization');
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth ?? '' } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Authentication is required.');
    const event = await request.json() as NotificationPayload;
    const { data: membership } = await client.from('hospital_users').select('hospital_id').eq('user_id', user.id).eq('hospital_id', event.hospital_id).maybeSingle();
    if (!membership) throw new Error('Notification hospital scope is invalid.');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: members } = await admin.from('hospital_users').select('user_id').eq('hospital_id', event.hospital_id);
    const recipients: string[] = [];
    for (const member of members ?? []) {
      const { data: userData } = await admin.auth.admin.getUserById(member.user_id);
      if (userData.user?.email) recipients.push(userData.user.email);
    }
    if (recipients.length) await sendEmail(recipients, event.title, event.message);
    return new Response(JSON.stringify({ sent: recipients.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Notification email failed.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
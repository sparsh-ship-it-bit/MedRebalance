import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const priceId = Deno.env.get('STRIPE_PRICE_ID');
    const appUrl = Deno.env.get('APP_URL');
    if (!secretKey || !priceId || !appUrl) throw new Error('Stripe checkout is not configured.');
    if (!secretKey.startsWith('sk_test_')) throw new Error('Stripe must be configured with a test-mode key.');

    const authHeader = request.headers.get('Authorization');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader ?? '' } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('You must be signed in to start billing.');

    const body = await request.json() as { hospital_id?: string; hospital_name?: string };
    if (!body.hospital_id || !body.hospital_name) throw new Error('Hospital billing details are required.');
    const { data: membership } = await supabase.from('hospital_users')
      .select('hospital_id').eq('user_id', user.id).eq('hospital_id', body.hospital_id).maybeSingle();
    if (!membership) throw new Error('You are not authorized to bill this hospital.');

    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email ?? undefined,
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      metadata: { hospital_id: body.hospital_id },
      subscription_data: { metadata: { hospital_id: body.hospital_id } },
    });
    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to start checkout.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
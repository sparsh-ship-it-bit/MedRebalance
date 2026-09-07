import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  try {
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secretKey || !webhookSecret || !serviceKey) throw new Error('Stripe webhook is not configured.');
    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });
    const signature = request.headers.get('stripe-signature');
    if (!signature) return new Response('Missing signature', { status: 400 });
    const event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret);
    const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
    const hospitalId = object.metadata?.hospital_id;
    if (hospitalId && ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      const subscription = event.type === 'checkout.session.completed'
        ? (object as Stripe.Checkout.Session).subscription?.toString() ?? null
        : (object as Stripe.Subscription);
      const status = event.type === 'customer.subscription.deleted'
        ? 'canceled'
        : (subscription as Stripe.Subscription | null)?.status ?? 'active';
      const currentPeriodEnd = typeof subscription === 'object' && subscription
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
      await supabase.from('hospital_billing').upsert({
        hospital_id: hospitalId,
        stripe_customer_id: typeof object.customer === 'string' ? object.customer : object.customer?.id ?? null,
        stripe_subscription_id: typeof subscription === 'string' ? subscription : subscription?.id ?? null,
        subscription_status: status,
        subscription_amount: typeof subscription === 'object' && subscription?.items.data[0]?.price.unit_amount
          ? subscription.items.data[0].price.unit_amount / 100 : 0,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      });
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Webhook failed.', { status: 400 });
  }
});
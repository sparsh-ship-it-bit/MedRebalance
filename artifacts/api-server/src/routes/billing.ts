import { Router, type IRouter } from "express";
import {
  CreateBillingCheckoutSessionBody,
  GetBillingLedgerQueryParams,
} from "@workspace/api-zod";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();
const PLATFORM_FEE_RATE = 0.035;

function toDate(value: number | null | undefined): string {
  return new Date((value ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
}

router.get("/billing/summary", async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const [subscriptions, paymentIntents] = await Promise.all([
      stripe.subscriptions.list({ status: "all", limit: 100 }),
      stripe.paymentIntents.list({ limit: 100 }),
    ]);

    const subscription = subscriptions.data.find((item) =>
      ["active", "trialing", "past_due"].includes(item.status),
    );
    const recurringPrice = subscription?.items.data[0]?.price;
    const completedTransfers = paymentIntents.data.filter(
      (intent) => intent.status === "succeeded" && Boolean(intent.metadata.transfer_id),
    );
    const feesCollected = completedTransfers.reduce(
      (total, intent) => total + Math.round(intent.amount * PLATFORM_FEE_RATE),
      0,
    );

    res.json({
      subscriptionStatus: subscription?.status ?? "none",
      monthlySubscriptionAmount:
        recurringPrice?.recurring?.interval === "month"
          ? recurringPrice.unit_amount ?? 0
          : 0,
      currency: recurringPrice?.currency ?? "usd",
      platformFeeRate: PLATFORM_FEE_RATE,
      feesCollected,
      completedTransfers: completedTransfers.length,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : "Stripe billing is temporarily unavailable.",
    });
  }
});

router.get("/billing/ledger", async (req, res) => {
  try {
    const { limit } = GetBillingLedgerQueryParams.parse(req.query);
    const stripe = await getUncachableStripeClient();
    const paymentIntents = await stripe.paymentIntents.list({ limit });
    const entries = paymentIntents.data
      .filter((intent) => Boolean(intent.metadata.transfer_id))
      .map((intent) => ({
        id: intent.id,
        transferId: intent.metadata.transfer_id ?? null,
        description: intent.description ?? "Completed medicine transfer",
        grossAmount: intent.amount,
        feeAmount: Math.round(intent.amount * PLATFORM_FEE_RATE),
        currency: intent.currency,
        status: intent.status,
        createdAt: toDate(intent.created),
      }));

    res.json(entries);
  } catch (error) {
    res.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : "Stripe ledger is temporarily unavailable.",
    });
  }
});

router.post("/billing/checkout-session", async (req, res) => {
  try {
    const body = CreateBillingCheckoutSessionBody.parse(req.body);
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: body.priceId, quantity: 1 }],
      customer_email: body.customerEmail ?? undefined,
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      payment_method_types: ["card"],
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create checkout session.";
    const status = error instanceof Error && error.name === "ZodError" ? 400 : 503;
    res.status(status).json({ error: message });
  }
});

export default router;
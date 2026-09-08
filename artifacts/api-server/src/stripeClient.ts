import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

type StripeCredentials = {
  secretKey: string;
  webhookSecret?: string;
};

async function getStripeCredentials(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !token) {
    throw new Error(
      "Stripe integration runtime variables are missing. Connect Stripe before starting billing.",
    );
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: token,
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Unable to read Stripe connection: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    items?: Array<{ settings?: { secret_key?: string; webhook_secret?: string } }>;
  };
  const settings = payload.items?.[0]?.settings;

  const secretKey = settings?.secret_key ?? process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "Stripe connection is missing its secret key. Configure the Stripe connection or set STRIPE_SECRET_KEY.",
    );
  }

  return {
    secretKey,
    webhookSecret:
      settings.webhook_secret ?? process.env.STRIPE_WEBHOOK_SECRET,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe synchronization.");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
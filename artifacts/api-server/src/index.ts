import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

async function initializeStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL is not configured; starting API without Stripe synchronization.");
    return;
  }

  try {
    await runMigrations({ databaseUrl, schema: "stripe" });
    const sync = await getStripeSync();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
    }
    await sync.syncBackfill();
  } catch (error) {
    // Stripe is an optional billing integration. It must not prevent the
    // health endpoint and the rest of the application from starting.
    logger.error({ err: error }, "Stripe initialization failed; continuing without Stripe sync");
  }
}

const rawPort = process.env["PORT"] || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initializeStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

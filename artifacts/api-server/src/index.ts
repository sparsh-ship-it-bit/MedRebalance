import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

async function initializeStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set before starting the API server.");
  }

  await runMigrations({ databaseUrl, schema: "stripe" });
  const sync = await getStripeSync();
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) {
    await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
  }
  await sync.syncBackfill();
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

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

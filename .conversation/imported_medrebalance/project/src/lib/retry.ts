/*
 * retry.ts — Retry wrapper for async operations.
 *
 * Role in the architecture:
 *   Wraps any async function (typically Supabase calls) with exponential
 *   backoff retry logic. If a network request fails due to a transient error
 *   (network timeout, 5xx), it retries up to `maxRetries` times before
 *   throwing the last error. This improves reliability without changing
 *   calling code — just wrap the function: `retry(() => supabase.from(...))`.
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY = 500;

export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_RETRIES,
  baseDelay: number = DEFAULT_BASE_DELAY
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

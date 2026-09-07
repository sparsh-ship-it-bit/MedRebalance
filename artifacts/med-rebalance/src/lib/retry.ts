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

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const candidate = error as { status?: number; code?: string; message?: string };
  if (typeof candidate.status === 'number') {
    return candidate.status === 408 || candidate.status === 425 || candidate.status === 429 || candidate.status >= 500;
  }
  return !candidate.code || /network|timeout|fetch|temporar/i.test(candidate.message ?? '');
}

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
      if (attempt < maxRetries && isRetryable(error)) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

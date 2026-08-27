/**
 * Rate-limit policy for the Shisa gateway.
 *
 * Observed live: the per-key limiter answers a burst of four register
 * requests with HTTP 429, phrased as an *authentication* error whose JSON
 * body carries the wait — "Retry after 297.369003ms" or "Retry after
 * 4.664162993s" — rather than a Retry-After header. Both spellings parse.
 */

/** Used when neither the header nor the body says how long to wait. */
export const RETRY_AFTER_DEFAULT_MS = 400;

const RATE_LIMIT_ATTEMPTS = 3;
const RATE_LIMIT_JITTER_MS = 150;

/**
 * Register launches are spaced by this much: four requests in the same
 * millisecond is exactly the burst the limiter rejects, and 150 ms is
 * invisible next to a multi-second generation. All four still overlap.
 */
export const LAUNCH_STAGGER_MS = 150;

/**
 * How long the gateway asked us to wait, in milliseconds.
 *
 * Precedence: a Retry-After header (delay-seconds or HTTP-date), then the
 * "Retry after N ms|s" text Shisa puts in the body, then the default.
 */
export function retryAfterMs(header: string | null, body: string, now: number = Date.now()): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.max(0, at - now);
  }
  const m = /retry after\s*([\d.]+)\s*(ms|s)\b/i.exec(body);
  if (m) {
    const n = Number(m[1]);
    return m[2].toLowerCase() === "ms" ? n : n * 1000;
  }
  return RETRY_AFTER_DEFAULT_MS;
}

/** setTimeout as a promise that rejects early if the caller aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Re-send on 429, waiting as long as the gateway asked plus jitter, up to
 * RATE_LIMIT_ATTEMPTS. Any other response — success or failure — is returned
 * untouched for the caller to judge; only the limiter is absorbed here.
 */
export async function withRateLimitRetry(
  send: () => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const res = await send();
    if (res.status !== 429 || attempt >= RATE_LIMIT_ATTEMPTS) return res;
    const detail = await res.text().catch(() => "");
    const wait = retryAfterMs(res.headers.get("retry-after"), detail);
    await delay(wait + Math.random() * RATE_LIMIT_JITTER_MS, signal);
  }
}

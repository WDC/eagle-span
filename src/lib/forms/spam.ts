/**
 * Four spam layers, and what each one is actually worth.
 *
 * The phase brief asks for honeypot, timing trap, Turnstile and a rate limit.
 * They are not four versions of the same check — they fail in different
 * directions, which is the reason to run all four:
 *
 * | Layer     | Catches                        | Costs a real lead when |
 * | --------- | ------------------------------ | ---------------------- |
 * | Honeypot  | Anything that fills every input | A password manager fills it |
 * | Timing    | Anything that submits instantly | Nothing — see below |
 * | Turnstile | Anything without a real browser | Scripting is off |
 * | Rate      | The same source, repeatedly     | A yard sends five trucks in |
 *
 * The governing rule for the whole file: **a lost lead costs more than a
 * received spam.** This is a shop where one missed message about a truck that
 * is down is a four-figure job, and the recipient is a human reading an inbox,
 * not an automated pipeline. So every layer here is tuned to let a doubtful
 * submission through and mark it, rather than to refuse it — the only thing
 * refused outright is a submission that could not plausibly have come from a
 * person.
 */

import { HONEYPOT_FIELD, TIMING_FIELD, TURNSTILE_FIELD } from './fields.ts';
import type { FormDataLike } from './validate.ts';

/** How the submission scored, for the log and for the lead itself. */
export interface SpamVerdict {
  /** False means: do not deliver this, and do not tell the sender why. */
  readonly accept: boolean;
  /**
   * True when Turnstile confirmed a real browser. False means the submission
   * is delivered but marked — see `unverified` in the mirror and the subject.
   */
  readonly verified: boolean;
  /** One short phrase per signal, in the order they ran. For the log line. */
  readonly signals: readonly string[];
}

/**
 * A submission faster than this was not typed by a person.
 *
 * Three seconds is the floor rather than an average: the shortest form here has
 * four fields, and nobody reads a label, types a phone number and submits
 * inside three seconds. Set higher it starts catching a returning customer
 * whose browser autofilled every field.
 */
const MIN_FILL_MS = 3_000;

/**
 * And this is the ceiling: a token older than a day is a page that sat open
 * over a weekend, which is fine, or a replayed body, which is not. It only
 * exists so the timing signal has two sides; it rejects nothing on its own.
 */
const MAX_FILL_MS = 24 * 60 * 60 * 1000;

export function checkHoneypot(data: FormDataLike): boolean {
  const value = data.get(HONEYPOT_FIELD);
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * The timing trap, and the honest thing about it.
 *
 * `renderedAt` is stamped by script when the page loads, because the page
 * itself is static and cached — there is no per-render token to embed, and a
 * build-time timestamp would say the same thing for every visitor for a week.
 *
 * That means a reader with no JavaScript sends no timestamp, and so does a bot
 * that simply omits the field. Absent is therefore *not* treated as a failure:
 * doing that would refuse every no-script submission, which is precisely the
 * reader this phase promised to keep. The trap catches the bots that do fill
 * it — the ones replaying a scripted page load — and the rest is left to the
 * other three layers.
 */
export function checkTiming(data: FormDataLike, now: number): 'ok' | 'too-fast' | 'absent' {
  const raw = data.get(TIMING_FIELD);
  if (typeof raw !== 'string' || raw.trim() === '') return 'absent';
  const stamped = Number(raw);
  if (!Number.isFinite(stamped)) return 'absent';
  const elapsed = now - stamped;
  // A stamp from the future, or from last week, is a stamp we cannot read.
  if (elapsed < 0 || elapsed > MAX_FILL_MS) return 'absent';
  return elapsed < MIN_FILL_MS ? 'too-fast' : 'ok';
}

export interface TurnstileConfig {
  readonly secret: string;
}

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

/**
 * Cloudflare's siteverify call.
 *
 * Returns `null` when Turnstile is not configured or the token is absent,
 * which the caller reads as "no signal" rather than as a failure — the same
 * reading as the timing trap, and for the same reason: Turnstile needs
 * JavaScript to produce a token at all, so requiring one would quietly make
 * scripting mandatory for reaching this shop.
 *
 * A network failure against Cloudflare also returns `null`. Failing open there
 * is deliberate: the alternative is that an outage at a third party silently
 * stops a truck shop receiving work.
 */
export async function verifyTurnstile(
  config: TurnstileConfig | null,
  data: FormDataLike,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  if (!config) return null;
  const token = data.get(TURNSTILE_FIELD);
  if (typeof token !== 'string' || token.trim() === '') return null;

  const body = new URLSearchParams({ secret: config.secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as SiteverifyResponse;
    return result.success === true;
  } catch {
    return null;
  }
}

export interface RateLimitConfig {
  readonly url: string;
  readonly token: string;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Submissions counted in the window, or null when there is no limiter. */
  readonly count: number | null;
}

/**
 * A fixed-window counter in Upstash Redis, over its REST API.
 *
 * Fixed window rather than a sliding one because the failure it prevents is a
 * script posting continuously, and for that the two are equivalent — a sliding
 * window buys precision at a boundary nobody here is trying to defend.
 *
 * The REST API is called directly rather than through `@upstash/ratelimit`: the
 * whole interaction is one INCR and one EXPIRE, and the endpoint's dependency
 * footprint is a thing this repo has been deliberate about since Phase 1.
 *
 * **Unconfigured means unlimited.** As everywhere else in this file, the
 * failure mode is chosen: a limiter that is not set up must not be the reason a
 * customer cannot reach the shop. `env.ts` reports it as missing so the state
 * is visible rather than assumed.
 */
export async function checkRateLimit(
  config: RateLimitConfig | null,
  key: string,
  limit: number,
  windowSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<RateLimitDecision> {
  if (!config) return { allowed: true, count: null };

  try {
    const response = await fetchImpl(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        // NX so a burst does not keep pushing the window out ahead of itself.
        ['EXPIRE', key, String(windowSeconds), 'NX'],
      ]),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { allowed: true, count: null };
    const results = (await response.json()) as { result?: unknown }[];
    const count = Number(results[0]?.result);
    if (!Number.isFinite(count)) return { allowed: true, count: null };
    return { allowed: count <= limit, count };
  } catch {
    // Same rule: an outage at the limiter is not allowed to close the shop.
    return { allowed: true, count: null };
  }
}

/**
 * The ceilings.
 *
 * A submission Turnstile vouched for gets the generous limit, because a real
 * browser that solved a challenge five times in ten minutes is a dispatcher
 * sending in a yard of trucks. One it could not vouch for — no token, so
 * either no JavaScript or no browser — gets the strict one, which is the
 * compromise that lets the no-script path stay open without leaving it as an
 * unmetered hole.
 */
export const LIMITS = {
  verified: { limit: 5, windowSeconds: 10 * 60 },
  unverified: { limit: 3, windowSeconds: 60 * 60 },
} as const;

export interface ScreenInput {
  readonly data: FormDataLike;
  readonly remoteIp: string | null;
  readonly turnstile: TurnstileConfig | null;
  readonly rateLimit: RateLimitConfig | null;
  readonly now?: number;
  readonly fetchImpl?: typeof fetch;
}

/** Runs the four layers in cost order: free checks first, network last. */
export async function screen(input: ScreenInput): Promise<SpamVerdict> {
  const now = input.now ?? Date.now();
  const fetchImpl = input.fetchImpl ?? fetch;
  const signals: string[] = [];

  if (!checkHoneypot(input.data)) {
    return { accept: false, verified: false, signals: ['honeypot:filled'] };
  }
  signals.push('honeypot:empty');

  const timing = checkTiming(input.data, now);
  signals.push(`timing:${timing}`);
  if (timing === 'too-fast') {
    return { accept: false, verified: false, signals };
  }

  const turnstile = await verifyTurnstile(input.turnstile, input.data, input.remoteIp, fetchImpl);
  signals.push(`turnstile:${turnstile === null ? 'no-signal' : turnstile ? 'pass' : 'fail'}`);
  if (turnstile === false) {
    return { accept: false, verified: false, signals };
  }
  const verified = turnstile === true;

  const { limit, windowSeconds } = verified ? LIMITS.verified : LIMITS.unverified;
  /*
   * Keyed on the address rather than on anything about the sender. It is
   * already in the request, it is not stored anywhere else, and the key expires
   * with the window — so the limiter holds no record of who wrote in.
   */
  const key = `form:${verified ? 'v' : 'u'}:${input.remoteIp ?? 'unknown'}`;
  const rate = await checkRateLimit(input.rateLimit, key, limit, windowSeconds, fetchImpl);
  signals.push(`rate:${rate.count === null ? 'no-limiter' : `${rate.count}/${limit}`}`);

  return { accept: rate.allowed, verified, signals };
}

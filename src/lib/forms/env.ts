/**
 * What is wired up, read once per request.
 *
 * Every integration this phase talks to is optional at runtime, and that is a
 * decision rather than an accident. The form has to work on a preview
 * deployment with nothing configured, on a production deployment with the
 * mailbox still pending (ClickUp 86bbw07dr is open), and on the finished thing
 * — and it must never be the case that a missing key silently swallows a lead.
 *
 * So: each integration reports itself present or absent, `deliver()` fans out
 * to the ones that are present, and the endpoint refuses the submission only if
 * **none** of them is. One configured destination is enough to accept a lead;
 * zero is a submission with nowhere to go, and telling the reader to call is
 * the honest answer to that.
 *
 * Read from both `import.meta.env` and `process.env`, in that order of
 * precedence, because the two carry different things in the two places this
 * code runs: under `astro dev` a `.env` file lands in `import.meta.env`, and on
 * the deployed function the Vercel project's variables land in `process.env`.
 * Reading one of them would work in exactly one of the two environments.
 */

import type { RateLimitConfig, TurnstileConfig } from './spam.ts';

type Env = Record<string, string | undefined>;

function read(env: Env, key: string): string | null {
  const value = env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export interface ResendConfig {
  readonly apiKey: string;
  /** A verified sender on the site's own domain. */
  readonly from: string;
  /** Where the shop reads its leads. */
  readonly to: readonly string[];
}

export interface ClickUpConfig {
  readonly token: string;
  readonly listId: string;
}

export interface BlobConfig {
  readonly token: string;
}

export interface FormsEnv {
  readonly resend: ResendConfig | null;
  readonly clickUp: ClickUpConfig | null;
  readonly blob: BlobConfig | null;
  readonly turnstile: TurnstileConfig | null;
  readonly rateLimit: RateLimitConfig | null;
}

function ambient(): Env {
  const built = import.meta.env as unknown as Env;
  const runtime = typeof process === 'undefined' ? {} : (process.env as Env);
  return { ...built, ...runtime };
}

export function readEnv(env: Env = ambient()): FormsEnv {
  const resendKey = read(env, 'RESEND_API_KEY');
  const from = read(env, 'LEAD_FROM_EMAIL');
  const to = read(env, 'LEAD_TO_EMAIL');

  const clickUpToken = read(env, 'CLICKUP_API_TOKEN');
  const listId = read(env, 'CLICKUP_LEADS_LIST_ID');

  const upstashUrl = read(env, 'UPSTASH_REDIS_REST_URL');
  const upstashToken = read(env, 'UPSTASH_REDIS_REST_TOKEN');

  const turnstileSecret = read(env, 'TURNSTILE_SECRET_KEY');
  const blobToken = read(env, 'BLOB_READ_WRITE_TOKEN');

  return {
    // All three or none: a key with no recipient sends a lead into the void.
    resend: resendKey && from && to ? { apiKey: resendKey, from, to: to.split(',').map((address) => address.trim()) } : null,
    clickUp: clickUpToken && listId ? { token: clickUpToken, listId } : null,
    blob: blobToken ? { token: blobToken } : null,
    turnstile: turnstileSecret ? { secret: turnstileSecret } : null,
    rateLimit: upstashUrl && upstashToken ? { url: upstashUrl.replace(/\/$/, ''), token: upstashToken } : null,
  };
}

/** True when a lead has at least one place to land. */
export function hasDestination(env: FormsEnv): boolean {
  return env.resend !== null || env.clickUp !== null;
}

/**
 * One line naming what is on and what is off, for the function's log.
 *
 * Written on every request rather than at cold start: on a serverless runtime
 * "at startup" is a moment nobody is watching, and the question this answers —
 * *was the mirror configured when that lead came in?* — is asked afterwards,
 * about a specific request.
 */
export function describe(env: FormsEnv): string {
  const state = (on: boolean) => (on ? 'on' : 'off');
  return [
    `email:${state(env.resend !== null)}`,
    `clickup:${state(env.clickUp !== null)}`,
    `blob:${state(env.blob !== null)}`,
    `turnstile:${state(env.turnstile !== null)}`,
    `ratelimit:${state(env.rateLimit !== null)}`,
  ].join(' ');
}

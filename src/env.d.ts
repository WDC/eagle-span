/**
 * The environment this site reads, declared.
 *
 * Every variable here is optional, and that is the contract Phase 5 works to:
 * the site builds and the form renders with none of them set. What changes is
 * how much the form can do — `src/lib/forms/env.ts` reports the state on every
 * request, and the endpoint refuses a submission only when a lead would have
 * nowhere at all to land.
 *
 * Declaring them buys two things. `import.meta.env.PUBLIC_*` typechecks under
 * `strictest` without bracket notation, which is what lets Vite replace it
 * statically at build; and the list of what has to be set in the Vercel project
 * is in the repository rather than in somebody's memory. README carries the
 * same table with the setup steps.
 */

interface ImportMetaEnv {
  /**
   * Cloudflare Turnstile's public site key. Read by the browser, so it is
   * `PUBLIC_` and is baked into the built HTML at build time — changing it
   * means a rebuild, not just a redeploy.
   *
   * Unset renders no widget, which is a supported state: the endpoint records
   * `turnstile:no-signal` and the submission goes through under the stricter
   * of the two rate limits.
   */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Server-side only, read at runtime through `process.env` rather than baked in.
 * None of these may ever be `PUBLIC_`: they are credentials, and a `PUBLIC_`
 * prefix would put them in the client bundle.
 *
 *   TURNSTILE_SECRET_KEY     Verifies a Turnstile token with Cloudflare.
 *   RESEND_API_KEY           Sends the notification email.
 *   LEAD_FROM_EMAIL          Verified sender on the site's own domain.
 *   LEAD_TO_EMAIL            Where the shop reads its leads. Comma-separated.
 *   CLICKUP_API_TOKEN        Mirrors the lead onto the board.
 *   CLICKUP_LEADS_LIST_ID    The Leads list in the EagleSpan folder.
 *   UPSTASH_REDIS_REST_URL   Rate limiter.
 *   UPSTASH_REDIS_REST_TOKEN Rate limiter.
 *   BLOB_READ_WRITE_TOKEN    Stores an uploaded photo or resume.
 */

/**
 * The one route on this site that is not a file.
 *
 * Phase 1 bought a property worth keeping: the production build carries no
 * serverless function at all, which is what makes `script-src 'self'` honest,
 * keeps the attack surface to static files, and is gated by
 * `verify:static-build`. A contact form cannot be delivered that way, so this
 * phase spends exactly one function and re-gates the property around it —
 * `ALLOWED_FUNCTIONS` names this route, and the same gate now also asserts that
 * it is the *only* on-demand route in the build. Adding a second one is a
 * failing check rather than a review someone has to notice.
 *
 * Both forms post here. They are two shapes of the same transaction — someone
 * writing to the shop — and splitting them into two routes would double the
 * spam screening, the delivery fan-out and the surface being gated, to save a
 * `switch`.
 *
 * ## Answering two clients
 *
 * A browser with no JavaScript posts a real form and expects a navigation, so
 * it gets 303 to a page. A browser with the enhancement posts the same body
 * with `Accept: application/json` and gets JSON, so the reader keeps their
 * place and their answers. The rule is that the no-script path is the one that
 * defines the behaviour and the scripted path is the refinement — not the
 * reverse, which is how a form ends up requiring a bundle to submit a name and
 * a phone number.
 */

import type { APIContext } from 'astro';

import { deliver, type Lead } from '~/lib/forms/delivery.ts';
import { describe, hasDestination, readEnv } from '~/lib/forms/env.ts';
import { FORMS, KIND_FIELD, isFormKind } from '~/lib/forms/fields.ts';
import { screen } from '~/lib/forms/spam.ts';
import { unknownFields, validate } from '~/lib/forms/validate.ts';
import { PAGES } from '~/lib/routes.ts';

export const prerender = false;

/** Where a form lives, so a redirect never has to trust anything posted. */
const SOURCE_PATH = {
  service: PAGES.contact,
  careers: PAGES.careers,
} as const;

/** The success page. One for both forms: the reader is told the same thing. */
const THANKS_PATH = '/contact/thanks';

/**
 * The fragment the failure redirect lands on.
 *
 * The form page renders a problem panel that is hidden until it is the
 * `:target`, so a reader with no JavaScript sees the message with no script and
 * no query-string reading. It says one thing — we could not take that, here is
 * the number — because the cases that reach it are a spam rejection, which
 * should not explain itself, and a delivery failure, which the reader cannot
 * act on except by calling.
 */
const PROBLEM_FRAGMENT = 'form-problem';

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

/**
 * The client address, from the proxy header Vercel sets.
 *
 * First entry only: the rest of `x-forwarded-for` is whatever earlier hops
 * claimed, and treating a spoofable tail as a rate-limit key is how a limiter
 * becomes decorative.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first !== '' ? first : null;
}

function redirect(path: string): Response {
  // 303 so a refresh of the result page does not re-post the form.
  return new Response(null, { status: 303, headers: { location: path } });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { request } = context;
  const env = readEnv();
  const receivedAt = new Date();

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return wantsJson(request)
      ? json({ ok: false, message: 'That submission could not be read.' }, 400)
      : redirect(`${SOURCE_PATH.service}#${PROBLEM_FRAGMENT}`);
  }

  const rawKind = data.get(KIND_FIELD);
  const kind = isFormKind(rawKind) ? rawKind : 'service';
  const source = SOURCE_PATH[kind];
  const failure = `${source}#${PROBLEM_FRAGMENT}`;

  /*
   * Screened before validated, and before anything is read out of the body.
   * A submission that fails the honeypot is not worth the work of checking
   * whether its phone number is well formed, and the rejection deliberately
   * looks identical to a delivery failure — a bot that is told which layer
   * caught it is a bot that gets fixed.
   */
  const verdict = await screen({
    data,
    remoteIp: clientIp(request),
    turnstile: env.turnstile,
    rateLimit: env.rateLimit,
    now: receivedAt.getTime(),
  });

  if (!verdict.accept) {
    console.warn(`contact rejected kind=${kind} ${verdict.signals.join(' ')} ${describe(env)}`);
    return wantsJson(request)
      ? json({ ok: false, message: 'We could not accept that submission. Please call the shop.' }, 429)
      : redirect(failure);
  }

  const result = await validate(kind, data);
  if (!result.ok) {
    console.warn(`contact invalid kind=${kind} fields=${Object.keys(result.errors).join(',')}`);
    return wantsJson(request)
      ? json({ ok: false, errors: result.errors }, 422)
      : redirect(failure);
  }

  const extra = unknownFields(kind, [...new Set([...data.keys()])]);
  if (extra.length > 0) console.info(`contact extra-fields kind=${kind} ${extra.join(',')}`);

  /*
   * Nowhere to put it. This is the one case the reader is told the truth about
   * rather than being shown a thank-you page: their message has not reached
   * anybody, and the number is the thing that works.
   */
  if (!hasDestination(env)) {
    console.error(`contact no-destination kind=${kind} ${describe(env)}`);
    return wantsJson(request)
      ? json({ ok: false, message: 'The message could not be sent. Please call the shop.' }, 503)
      : redirect(failure);
  }

  const lead: Lead = {
    spec: FORMS[kind],
    submission: result,
    verified: verdict.verified,
    receivedAt,
    sourcePath: source,
  };

  const outcome = await deliver(env, lead);
  const log = `contact kind=${kind} delivered=${outcome.delivered} ${verdict.signals.join(' ')} ${outcome.results.join(' ')} ${describe(env)}`;

  if (!outcome.delivered) {
    console.error(log);
    return wantsJson(request)
      ? json({ ok: false, message: 'The message could not be sent. Please call the shop.' }, 502)
      : redirect(failure);
  }

  console.info(log);
  return wantsJson(request) ? json({ ok: true }, 200) : redirect(THANKS_PATH);
}

/**
 * Anything that is not a POST.
 *
 * A GET here is a crawler, a link check or somebody curious; 405 with an Allow
 * header is the correct answer to all three, and it keeps the route out of the
 * index without needing a robots rule.
 */
export const ALL = (): Response =>
  new Response('This endpoint takes form submissions only.', {
    status: 405,
    headers: { allow: 'POST', 'x-robots-tag': 'noindex' },
  });

#!/usr/bin/env node
/**
 * Verifies every row of data/redirects.csv against a deployed origin.
 *
 * The gate: one hop, correct destination, and the destination itself returns
 * 200. A redirect that lands on a 404 or chains through a second hop is a
 * failed migration, not a passing one.
 *
 * Usage: bun run build && node scripts/verify-redirects.mjs https://origin
 *
 * The build has to exist first: a redirect can only be held to "its destination
 * is live" once this repo actually produces that page. Until Phase 3 migrates
 * the content, most destinations are routes the site has not built yet, and a
 * gate that fails on those would sit red for weeks and teach everyone to
 * ignore it. Those rows report as pending instead, and become real checks on
 * their own as the pages land — no flag anybody has to remember to flip.
 *
 * Set VERCEL_AUTOMATION_BYPASS_SECRET when the origin has Vercel deployment
 * protection on, which every preview URL on this project does. See the preview
 * gates section of the README.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { staticRoot } from './lib/dist.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = (process.argv[2] ?? process.env['DEPLOY_URL'] ?? '').replace(/\/$/, '');

if (!origin) {
  console.error('usage: node scripts/verify-redirects.mjs <origin>');
  process.exit(2);
}

const { redirects } = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));

const dist = staticRoot(root);
if (!existsSync(dist)) {
  console.error('dist/ is missing — run `bun run build` before verifying redirects.');
  process.exit(2);
}

/**
 * Does this build produce that path? `build.format: 'file'` with
 * `trailingSlash: 'never'` means /service is dist/service.html and / is
 * dist/index.html.
 *
 * An absolute destination points off-site, so the build cannot answer for it
 * and it is always checked against the origin.
 */
function builtLocally(destination) {
  if (destination.startsWith('http')) return true;
  const rel = destination === '/' ? 'index.html' : `${destination.replace(/^\//, '')}.html`;
  return existsSync(resolve(dist, rel));
}

/*
 * Vercel deployment protection answers every unauthenticated request with a 302
 * to a login page. Sending this secret as a header is the documented way past
 * it for automation; without it this script reports six perfectly correct
 * redirects as broken, and every failure is a login redirect.
 *
 * A header, not a `?x-vercel-protection-bypass=` query parameter: the secret
 * then never appears in a URL that could be logged or written to a report.
 */
const bypass = process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] ?? '';
const headers = bypass ? { 'x-vercel-protection-bypass': bypass } : {};

const PROTECTED = /vercel\.com\/sso-api|\/\.well-known\/vercel\/|^\/login/;

/**
 * One request before the six, so a protection problem reads as a protection
 * problem. Diagnosing it from six chained-redirect failures takes an afternoon.
 */
async function preflight() {
  let res;
  try {
    res = await fetch(`${origin}/`, { redirect: 'manual', headers });
  } catch (err) {
    console.error(`Cannot reach ${origin}: ${err.message}`);
    process.exit(2);
  }

  if (res.status === 200) return;

  const location = res.headers.get('location') ?? '';

  if (PROTECTED.test(location)) {
    console.error(
      `${origin}/ answered ${res.status} -> ${location}\n\n` +
      'That is Vercel deployment protection, not a redirect problem — the\n' +
      'origin is asking for a login this job cannot do.\n\n' +
      (bypass
        ? 'VERCEL_AUTOMATION_BYPASS_SECRET is set but was not accepted. It is\n' +
          'probably stale: regenerating the token in Vercel invalidates the old\n' +
          'one, so the repository secret has to be updated to match.'
        : 'VERCEL_AUTOMATION_BYPASS_SECRET is not set. Create the token in the\n' +
          'Vercel project under Deployment Protection -> Protection Bypass for\n' +
          'Automation, then add it to this repository as a secret of that name.'),
    );
    process.exit(2);
  }

  console.error(`${origin}/ answered ${res.status}${location ? ` -> ${location}` : ''}, expected 200.`);
  process.exit(2);
}

await preflight();

let failed = 0;
const CONCURRENCY = 8;

async function check({ source, destination, statusCode }) {
  const problems = [];
  let res;

  try {
    res = await fetch(origin + source, { redirect: 'manual', headers });
  } catch (err) {
    return { source, problems: [`request failed: ${err.message}`] };
  }

  /*
   * The hop itself is the redirect map's contract and is always enforced:
   * right status, right destination, no chain. This half is meaningful from
   * the first deploy and has nothing to do with whether the content exists.
   */
  if (res.status !== statusCode) problems.push(`expected ${statusCode}, got ${res.status}`);

  const location = res.headers.get('location') ?? '';
  const landed = location.startsWith('http') ? new URL(location).pathname : location;
  if (landed !== destination) problems.push(`expected -> ${destination}, got -> ${location || '(none)'}`);

  /*
   * The destination's liveness is only assertable once this build produces the
   * page. A destination the site has not built yet is pending, not broken.
   */
  if (!builtLocally(destination)) return { source, destination, problems, pending: true };

  if (location) {
    try {
      const final = await fetch(location.startsWith('http') ? location : origin + location, {
        redirect: 'manual',
        headers,
      });
      if (final.status >= 300 && final.status < 400) {
        problems.push(`chain: destination redirects again to ${final.headers.get('location')}`);
      } else if (final.status !== 200) {
        problems.push(`destination returned ${final.status}`);
      }
    } catch (err) {
      problems.push(`destination unreachable: ${err.message}`);
    }
  }

  return { source, destination, problems, pending: false };
}

let pending = 0;

const queue = [...redirects];
const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const result = await check(item);
    if (result.problems.length) {
      failed += 1;
      console.error(`FAIL ${result.source}`);
      for (const p of result.problems) console.error(`     ${p}`);
    } else if (result.pending) {
      pending += 1;
      console.log(`--   ${result.source} -> ${item.destination} (${item.statusCode})  hop ok, destination not built yet`);
    } else {
      console.log(`ok   ${result.source} -> ${item.destination} (${item.statusCode})`);
    }
  }
});

await Promise.all(workers);

const verified = redirects.length - failed - pending;
console.log(
  `\n${verified}/${redirects.length} redirects fully verified against ${origin}` +
  (pending ? `, ${pending} pending a destination this build does not produce yet` : '') +
  (failed ? `, ${failed} failed` : ''),
);
if (failed) process.exit(1);

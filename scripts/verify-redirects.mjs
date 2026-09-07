#!/usr/bin/env node
/**
 * Verifies every row of data/redirects.csv against a deployed origin.
 *
 * The gate: one hop, correct destination, and the destination itself returns
 * 200. A redirect that lands on a 404 or chains through a second hop is a
 * failed migration, not a passing one.
 *
 * Usage: node scripts/verify-redirects.mjs https://preview-url.vercel.app
 *
 * Set VERCEL_AUTOMATION_BYPASS_SECRET when the origin has Vercel deployment
 * protection on, which every preview URL on this project does. See the preview
 * gates section of the README.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = (process.argv[2] ?? process.env['DEPLOY_URL'] ?? '').replace(/\/$/, '');

if (!origin) {
  console.error('usage: node scripts/verify-redirects.mjs <origin>');
  process.exit(2);
}

const { redirects } = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));

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

  if (res.status !== statusCode) problems.push(`expected ${statusCode}, got ${res.status}`);

  const location = res.headers.get('location') ?? '';
  const landed = location.startsWith('http') ? new URL(location).pathname : location;
  if (landed !== destination) problems.push(`expected -> ${destination}, got -> ${location || '(none)'}`);

  // Second hop: the destination must be terminal and live.
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

  return { source, problems };
}

const queue = [...redirects];
const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const { source, problems } = await check(item);
    if (problems.length) {
      failed += 1;
      console.error(`FAIL ${source}`);
      for (const p of problems) console.error(`     ${p}`);
    } else {
      console.log(`ok   ${source} -> ${item.destination} (${item.statusCode})`);
    }
  }
});

await Promise.all(workers);

console.log(`\n${redirects.length - failed}/${redirects.length} redirects verified against ${origin}`);
if (failed) process.exit(1);

#!/usr/bin/env node
/**
 * Verifies every row of data/redirects.csv against a deployed origin.
 *
 * The gate: one hop, correct destination, and the destination itself returns
 * 200. A redirect that lands on a 404 or chains through a second hop is a
 * failed migration, not a passing one.
 *
 * Usage: node scripts/verify-redirects.mjs https://preview-url.vercel.app
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

let failed = 0;
const CONCURRENCY = 8;

async function check({ source, destination, statusCode }) {
  const problems = [];
  let res;

  try {
    res = await fetch(origin + source, { redirect: 'manual' });
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

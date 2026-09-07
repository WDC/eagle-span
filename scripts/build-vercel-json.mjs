#!/usr/bin/env node
/**
 * Generates vercel.json from data/redirects.csv plus the static header policy.
 *
 * Redirects are emitted with an explicit `"statusCode": 301`. Vercel's
 * `"permanent": true` emits 308 — Google treats the two identically but a lot
 * of SEO tooling does not, and the migration is going to be audited with that
 * tooling. So: 301, spelled out.
 *
 * Run by `bun run build` before `astro build`. vercel.json is committed so the
 * diff is reviewable; CI fails if it is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal RFC 4180 parser — fields may contain commas and escaped quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; }
      } else { field += ch; }
      continue;
    }

    if (ch === '"') { quoted = true; }
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { /* ignore */ }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += ch; }
  }

  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const csv = readFileSync(resolve(root, 'data/redirects.csv'), 'utf8');
const [header, ...dataRows] = parseCsv(csv);

const expected = ['source', 'destination', 'status', 'reason'];
if (expected.some((c, i) => header[i] !== c)) {
  throw new Error(`redirects.csv header must be ${expected.join(',')} — got ${header.join(',')}`);
}

const seen = new Set();
const redirects = dataRows.map(([source, destination, status, reason], i) => {
  const line = i + 2;

  if (!source.startsWith('/')) throw new Error(`line ${line}: source must start with / — got "${source}"`);
  if (!destination.startsWith('/') && !destination.startsWith('http')) {
    throw new Error(`line ${line}: destination must be a path or absolute URL — got "${destination}"`);
  }
  if (source === destination) throw new Error(`line ${line}: source and destination are identical (${source})`);
  if (seen.has(source)) throw new Error(`line ${line}: duplicate source "${source}"`);
  if (!reason.trim()) throw new Error(`line ${line}: every redirect needs a reason`);
  seen.add(source);

  const code = Number(status);
  if (![301, 302, 307, 308].includes(code)) throw new Error(`line ${line}: unexpected status "${status}"`);

  return { source, destination, statusCode: code };
});

// A destination that is itself a source would produce a redirect chain; the
// Phase 6 gate requires every URL to resolve in exactly one hop.
for (const r of redirects) {
  if (seen.has(r.destination)) {
    throw new Error(`chain: ${r.source} -> ${r.destination}, but ${r.destination} is itself redirected`);
  }
}

const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  redirects,
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        },
        {
          // No third-party scripts, no Maps iframe: the static map image
          // replaced it. Keeps the CSP tight enough to be worth having.
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "object-src 'none'",
            'upgrade-insecure-requests',
          ].join('; '),
        },
      ],
    },
    {
      // Astro fingerprints these, so they are immutable by construction.
      source: '/_astro/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/fonts/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
};

const out = `${JSON.stringify(config, null, 2)}\n`;
const target = resolve(root, 'vercel.json');

// In CI, verify rather than write, so a stale committed file fails the build.
if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== out) {
    console.error('vercel.json is stale — run `bun run redirects:build` and commit the result.');
    process.exit(1);
  }
  console.log(`vercel.json up to date (${redirects.length} redirects).`);
} else {
  writeFileSync(target, out);
  console.log(`vercel.json written — ${redirects.length} redirects, ${config.headers.length} header rules.`);
}

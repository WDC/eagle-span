#!/usr/bin/env node
/**
 * The production build is static, and Keystatic is not in it.
 *
 * Phase 1 chose local mode for Keystatic on the strength of one claim: the
 * admin UI and its write endpoint are dev-only, so the deployed site has no
 * serverless functions, nothing behind Vercel's deployment protection, and no
 * unauthenticated endpoint that writes files. That claim is one careless
 * `integrations: [keystatic()]` away from being false, and the failure is
 * invisible — the site still works, it just also ships a CMS.
 *
 * Phase 5 spends exactly one function on the contact form, so the claim is now
 * narrower and the gate had to get sharper to keep meaning anything: it is no
 * longer "there are no functions" but "there is one, and only these routes
 * reach it". The adapter bundles every on-demand route into a single
 * `_render.func`, so counting functions would not notice a second one — the
 * routing table is where a new dynamic route actually shows up.
 *
 * So it is a gate. Four checks, all on the real build output:
 *
 *   1. `.vercel/output/functions` holds nothing but the functions named below.
 *   2. Nothing is routed to a function except the routes named below —
 *      `/api/contact` plus the two the adapter always emits for itself.
 *   3. No built route is a Keystatic or API route in the static output.
 *   4. Nothing in the built assets mentions Keystatic — a stray import would
 *      pull the admin bundle into a page.
 *
 * Run after `bun run build`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

import { staticRoot } from './lib/dist.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = staticRoot(root);
const vercelOutput = resolve(root, '.vercel/output');

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  ✗ ${message}`);
};

if (!existsSync(dist)) {
  console.error('dist/ is missing. Run `bun run build` first.');
  process.exit(1);
}

/**
 * The one function the deployed site carries.
 *
 * `@astrojs/vercel` bundles every on-demand route into this single function, so
 * the name is the adapter's rather than the route's — which is exactly why the
 * routing check below exists as well.
 */
const ALLOWED_FUNCTIONS = ['_render.func'];

/**
 * The routes allowed to reach it.
 *
 * `/api/contact` is Phase 5's contact endpoint. The other two are the adapter's
 * own: `_server-islands` is emitted whether or not the site uses one, and
 * `_image` is Astro's image endpoint. Neither is reachable as a page.
 *
 * Anything else routed to a function is a new on-demand route, and this is the
 * line that has to be edited — deliberately, in a diff somebody reviews — for
 * one to ship.
 */
const ALLOWED_FUNCTION_ROUTES = [
  '^/api/contact$',
  '^/_server-islands/([^/]+?)$',
  '^/_image$',
];

const functionsDir = resolve(vercelOutput, 'functions');
if (existsSync(functionsDir)) {
  for (const name of readdirSync(functionsDir)) {
    if (!ALLOWED_FUNCTIONS.includes(name)) {
      fail(`.vercel/output/functions/${name} — not a function this site is meant to deploy`);
    }
  }
}

const configPath = resolve(vercelOutput, 'config.json');
if (existsSync(configPath)) {
  const routes = JSON.parse(readFileSync(configPath, 'utf8')).routes ?? [];
  for (const route of routes) {
    // `dest` naming a function, rather than a file, is what makes a route dynamic.
    if (typeof route.dest !== 'string' || route.dest.includes('.')) continue;
    if (!ALLOWED_FUNCTION_ROUTES.includes(route.src)) {
      fail(
        `${route.src} -> ${route.dest} — an on-demand route this build is not meant to have. ` +
          'Add it to ALLOWED_FUNCTION_ROUTES only if it is meant to be a function.',
      );
    }
  }
} else if (existsSync(functionsDir)) {
  fail('.vercel/output/config.json is missing, so the routing table cannot be checked');
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const built = walk(dist);

for (const file of built) {
  const path = relative(dist, file);
  if (/(^|\/)(keystatic|api)(\/|$)/.test(path)) {
    fail(`dist/${path} — a Keystatic or API route reached the static build`);
  }
}

/*
 * The admin bundle is large and unmistakable. A page that imported it would
 * still render, so the only sign is the string turning up in the output.
 */
const TEXTUAL = new Set(['.html', '.js', '.css', '.json', '.xml']);
for (const file of built.filter((f) => TEXTUAL.has(extname(f)))) {
  if (readFileSync(file, 'utf8').includes('keystatic')) {
    fail(`dist/${relative(dist, file)} references Keystatic`);
  }
}

console.log(
  `\nstatic build: ${built.length} files, ${ALLOWED_FUNCTIONS.length} function(s) and ` +
  `${ALLOWED_FUNCTION_ROUTES.length} dynamic route(s) allowed, ` +
  `${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

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
 * So it is a gate. Three checks, all on the real build output:
 *
 *   1. `.vercel/output/functions` is empty or absent. Phase 5 adds exactly one
 *      function, for the contact form, and this list is where that gets
 *      reviewed rather than assumed.
 *   2. No built route is a Keystatic route.
 *   3. Nothing in the built assets mentions Keystatic — a stray import would
 *      pull the admin bundle into a page.
 *
 * Run after `bun run build`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
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
 * The functions Phase 5 is allowed to add. Until then the deployed site is
 * entirely static, which is the whole reason Keystatic runs locally.
 */
const ALLOWED_FUNCTIONS = [];

const functionsDir = resolve(vercelOutput, 'functions');
if (existsSync(functionsDir)) {
  for (const name of readdirSync(functionsDir)) {
    if (!ALLOWED_FUNCTIONS.includes(name)) {
      fail(`.vercel/output/functions/${name} — the production build should carry no serverless function`);
    }
  }
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
  `\nstatic build: ${built.length} files, ${ALLOWED_FUNCTIONS.length} function(s) allowed, ` +
  `${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

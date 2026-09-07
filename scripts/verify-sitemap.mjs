#!/usr/bin/env node
/**
 * The sitemap describes this build, and its dates are real.
 *
 * `src/pages/sitemap.xml.ts` replaced `@astrojs/sitemap` so that `lastmod`
 * could come from the content and from git rather than from `Date.now()`. That
 * bought a real date and cost the integration's one guarantee: it derived its
 * URLs by scanning the routes it had just built, so the sitemap could not
 * disagree with the site. This is what replaces that guarantee.
 *
 * Four things, all read off `dist/`:
 *
 *   1. Every URL in the sitemap is a page this build produced.
 *   2. Every page this build produced is in the sitemap — unless it says
 *      `noindex`, in which case it must not be. A sitemap asks for a page to be
 *      indexed and a robots meta refuses; a page in both is a contradiction a
 *      crawler resolves by trusting neither.
 *   3. Every `lastmod` is a real date, not in the future. When git history is
 *      available every URL has one, because a sitemap that quietly stopped
 *      carrying dates looks exactly like one that never did.
 *   4. `robots.txt` points at it, and so does the `<link rel="sitemap">` in the
 *      pages.
 *
 * "Never the build time" is not checked here, because it cannot be: today's
 * commits produce today's dates and the two are indistinguishable after the
 * fact. It is structural instead — `src/lib/lastmod.ts` has no branch that can
 * return the current time, and its fallback is to omit the field.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

const { site } = await import('../src/site.config.ts');

let failures = 0;
const fail = (message) => { failures += 1; console.error(`  ✗ ${message}`); };

if (!existsSync(dist)) {
  console.error('dist/ is missing. Run `bun run build` first.');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

/** `/services/x/index.html` is served at `/services/x`; the root is `/`. */
const pathOf = (file) => {
  const trimmed = `/${relative(dist, file)}`.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  return trimmed === '' ? '/' : trimmed;
};

const sitemapPath = resolve(dist, 'sitemap.xml');
if (!existsSync(sitemapPath)) {
  console.error('dist/sitemap.xml is missing.');
  process.exit(1);
}
const xml = readFileSync(sitemapPath, 'utf8');

/* One <url> block at a time, so a loc and its lastmod stay associated. */
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((block) => ({
  loc: block[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '',
  lastmod: block[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1],
}));

if (entries.length === 0) fail('the sitemap has no <url> entries');

const seen = new Set();
const listed = new Set();

for (const entry of entries) {
  if (!entry.loc.startsWith(`${site.url}/`)) {
    fail(`${entry.loc} is not an absolute URL on ${site.url}`);
    continue;
  }
  if (seen.has(entry.loc)) fail(`${entry.loc} is listed twice`);
  seen.add(entry.loc);

  const path = entry.loc.replace(site.url, '') || '/';
  listed.add(path === '' ? '/' : path);

  if (entry.lastmod !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) {
      fail(`${path}: lastmod "${entry.lastmod}" is not a YYYY-MM-DD date`);
    } else if (entry.lastmod > new Date().toISOString().slice(0, 10)) {
      /* Compared as UTC calendar dates: a commit made an hour ago is today, not the future. */
      fail(`${path}: lastmod ${entry.lastmod} is in the future`);
    }
  }
}

/*
 * A date can only be expected when there is history to read it from. In a
 * shallow clone `git log -1 -- <file>` returns the tip commit for every path,
 * so src/lib/lastmod.ts refuses to guess and omits the field — expecting one
 * here would just fail every CI job that forgot `fetch-depth: 0`, which is a
 * worse signal than the one it is trying to give.
 */
let historyAvailable = false;
try {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  historyAvailable = git('rev-parse', '--is-inside-work-tree') === 'true'
    && git('rev-parse', '--is-shallow-repository') === 'false';
} catch { historyAvailable = false; }

if (historyAvailable) {
  for (const entry of entries) {
    if (!entry.lastmod) fail(`${entry.loc.replace(site.url, '')}: no lastmod, and git history is available`);
  }
}

/* Both directions between the built pages and the sitemap. */
const pages = walk(dist);
for (const file of pages) {
  const path = pathOf(file);
  const html = readFileSync(file, 'utf8');
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);

  if (noindex && listed.has(path)) fail(`${path} is noindex and in the sitemap — the two contradict each other`);
  if (!noindex && !listed.has(path)) fail(`${path} is indexable but missing from the sitemap`);

  if (!/<link[^>]+rel=["']sitemap["'][^>]+href=["']\/sitemap\.xml["']/i.test(html)) {
    fail(`${path} does not link /sitemap.xml`);
  }
}

const builtPaths = new Set(pages.map(pathOf));
for (const path of listed) {
  if (!builtPaths.has(path)) fail(`${path} is in the sitemap but this build does not produce it`);
}

/* robots.txt is how a crawler finds any of this. */
const robotsPath = resolve(dist, 'robots.txt');
if (!existsSync(robotsPath)) fail('dist/robots.txt is missing');
else if (!readFileSync(robotsPath, 'utf8').includes(`Sitemap: ${site.url}/sitemap.xml`)) {
  fail('robots.txt does not name the sitemap');
}

const dated = entries.filter((e) => e.lastmod).length;
console.log(
  `\nsitemap: ${entries.length} urls, ${dated} with lastmod, ` +
  `${pages.length - listed.size} page(s) held back, ${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

#!/usr/bin/env node
/**
 * The files an agent or a crawler asks for before it asks for a page.
 *
 * `verify:sitemap` already proves the sitemap and the built site list the same
 * pages. This is the same guarantee for the three artefacts that were added
 * next to it and would otherwise be checked by nobody:
 *
 *   1. **`/llms.txt`** is built from `listSitePages()`, the same inventory the
 *      sitemap and the OG cards come from — so a page in the build must be in
 *      it, a `noindex` page must not, and every URL it names must be a page
 *      this build produced. That derivation is the reason it can be trusted;
 *      this is what stops it being trusted after somebody stops deriving it.
 *      Its shape is checked too, because the whole value of the format is that
 *      it is predictable: an H1, a blockquote summary, and `- [title](url)`
 *      rows under H2 headings.
 *   2. **The icons.** `src/lib/icon.ts` draws them and `BaseLayout` links them.
 *      A `<link rel="icon">` pointing at a path the build does not produce is a
 *      404 on every page that nothing else notices — the tab just shows the
 *      default glyph, which is also what it showed before the icon existed.
 *   3. **`robots.txt`** names both the sitemap and llms.txt. The sitemap half
 *      is checked by `verify:sitemap`; the llms half is checked here, next to
 *      the file it points at.
 *
 * Everything is read off `dist/`, never off the source, for the reason the
 * other gates give: the question is what shipped.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

import { staticRoot } from './lib/dist.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = staticRoot(root);

const { site } = await import('../src/site.config.ts');

let failures = 0;
const fail = (message) => { failures += 1; console.error(`  ✗ ${message}`); };

if (!existsSync(dist)) {
  console.error('dist/ is missing. Run `bun run build` first.');
  process.exit(1);
}

const read = (file) => readFileSync(resolve(dist, file), 'utf8');

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

const htmlFiles = walk(dist);

/* ------------------------------------------------------------------ llms.txt */

if (!existsSync(resolve(dist, 'llms.txt'))) {
  console.error('dist/llms.txt is missing.');
  process.exit(1);
}

const llms = read('llms.txt');
const lines = llms.split('\n');

if (!lines[0]?.startsWith('# ')) fail('llms.txt does not open with an H1');
else if (!lines[0].includes(site.name)) fail(`llms.txt's H1 does not name "${site.name}"`);

/* The summary blockquote is the one line a consumer short of context reads. */
if (!lines.some((line) => line.startsWith('> ') && line.length > 2)) {
  fail('llms.txt has no `>` summary line');
}

if (!llms.includes(site.phoneDisplay)) fail(`llms.txt does not carry the NAP phone (${site.phoneDisplay})`);
if (!llms.includes(site.address.street)) fail('llms.txt does not carry the NAP street address');

/*
 * A phone number in any other format is the defect this whole repository is
 * organised against — the live site emits five. `verify:jsonld` makes the same
 * check against the rendered pages.
 */
for (const match of llms.matchAll(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g)) {
  if (match[0] !== site.phoneDisplay) fail(`llms.txt writes the phone as "${match[0]}", not "${site.phoneDisplay}"`);
}

if (!llms.includes(`${site.url}/sitemap.xml`)) fail('llms.txt does not point at the sitemap');

/* Headings, so a section cannot silently lose its rows and stay well-formed. */
const headings = lines.filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
if (headings.length === 0) fail('llms.txt has no `##` sections');

/* `- [title](url): description` — the row format the proposal specifies. */
const rows = [...llms.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)(?:: (.*))?$/gm)].map((m) => ({
  title: m[1],
  url: m[2],
  description: m[3],
}));

if (rows.length === 0) fail('llms.txt lists no pages');

const listed = new Set();
for (const row of rows) {
  if (!row.url.startsWith(`${site.url}/`)) {
    fail(`llms.txt: ${row.url} is not an absolute URL on ${site.url}`);
    continue;
  }
  const path = row.url.replace(site.url, '') || '/';
  if (listed.has(path)) fail(`llms.txt lists ${path} twice`);
  listed.add(path);

  if (!row.title.trim()) fail(`llms.txt: ${path} has an empty title`);
  if (!row.description?.trim()) fail(`llms.txt: ${path} has no description`);
}

/*
 * Both directions against the build, exactly as the sitemap gate does it. A
 * `noindex` page in an index written for assistants is the same contradiction
 * as one in a sitemap: `/contact/thanks` is a receipt, not an answer.
 */
const builtPaths = new Set(htmlFiles.map(pathOf));
for (const file of htmlFiles) {
  const path = pathOf(file);
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(readFileSync(file, 'utf8'));

  if (noindex && listed.has(path)) fail(`${path} is noindex and in llms.txt — the two contradict each other`);
  if (!noindex && !listed.has(path)) fail(`${path} is indexable but missing from llms.txt`);
}
for (const path of listed) {
  if (!builtPaths.has(path)) fail(`${path} is in llms.txt but this build does not produce it`);
}

/* --------------------------------------------------------------------- icons */

/*
 * Every page declares the same icons, and each of them is a file. Checked on
 * every page rather than on one, because the layout is not the only thing that
 * can emit a head — the 404 renders through it today and a template that
 * stopped would be the failure this catches.
 */
const iconRefs = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const path = pathOf(file);

  const refs = [...html.matchAll(/<link[^>]+rel=["']((?:apple-touch-)?icon)["'][^>]*>/gi)]
    .map((tag) => ({ rel: tag[1], href: tag[0].match(/href=["']([^"']+)["']/)?.[1] }));

  for (const rel of ['icon', 'apple-touch-icon']) {
    if (!refs.some((ref) => ref.rel.toLowerCase() === rel)) fail(`${path} declares no rel="${rel}"`);
  }

  for (const ref of refs) {
    if (!ref.href) { fail(`${path}: a rel="${ref.rel}" link has no href`); continue; }
    iconRefs.set(ref.href, path);
  }

  if (!/<link[^>]+rel=["']alternate["'][^>]+href=["']\/llms\.txt["']/i.test(html)) {
    fail(`${path} does not link /llms.txt`);
  }
}

for (const [href, path] of iconRefs) {
  if (!href.startsWith('/')) { fail(`${path}: icon href "${href}" is not root-relative`); continue; }
  if (!existsSync(resolve(dist, href.slice(1)))) fail(`${path}: icon "${href}" is not in the build`);
}

/*
 * A zero-byte or truncated PNG satisfies `existsSync` and shows nothing. Eight
 * bytes of signature is the cheapest proof that resvg actually rendered.
 */
const touchIcon = resolve(dist, 'apple-touch-icon.png');
if (existsSync(touchIcon)) {
  const bytes = readFileSync(touchIcon);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(png)) fail('apple-touch-icon.png is not a PNG');
  else if (bytes.length < 512) fail(`apple-touch-icon.png is ${bytes.length} bytes — it rendered empty`);
}

/* ----------------------------------------------------------------- robots.txt */

const robotsPath = resolve(dist, 'robots.txt');
if (!existsSync(robotsPath)) fail('dist/robots.txt is missing');
else if (!readFileSync(robotsPath, 'utf8').includes(`${site.url}/llms.txt`)) {
  fail('robots.txt does not name llms.txt');
}

console.log(
  `\nmetadata: llms.txt lists ${rows.length} page(s) in ${headings.length} section(s), ` +
  `${iconRefs.size} icon(s) declared across ${htmlFiles.length} page(s), ` +
  `${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

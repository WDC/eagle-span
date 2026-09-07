#!/usr/bin/env node
/**
 * Keeps the committed font artefacts agreeing with each other.
 *
 * `scripts/build-fonts.py` produces four things that have to stay in step: the
 * woff2 files, the @font-face CSS, the preload hrefs in TypeScript, and the
 * manifest. Anyone can edit three of them by hand and get a green build with a
 * broken page — a stale hash in fonts.css is a 404 that falls back silently to
 * Arial, which looks fine on a laptop and wrong on a spec table.
 *
 * This is a Node gate rather than a regenerate-and-diff, because woff2
 * compression is not byte-reproducible across fontTools versions: rebuilding in
 * CI to compare would fail on a dependency bump rather than on a real problem.
 * So the manifest records the digests and this checks them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const manifest = JSON.parse(read('data/fonts.json'));
const css = read('src/styles/fonts.css');
const ts = read('src/lib/fonts.generated.ts');
const tokens = read('src/styles/tokens.css');
const globalCss = read('src/styles/global.css');
const layout = read('src/layouts/BaseLayout.astro');

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`FAIL ${msg}`); };

/* Every face: the bytes on disk are the bytes the manifest describes, and both
 * the stylesheet and the preload module point at that exact filename. */
for (const face of manifest.faces) {
  const path = resolve(root, 'public/fonts', face.file);

  if (!existsSync(path)) {
    fail(`${face.file} is missing from public/fonts — run \`bun run fonts:build\``);
    continue;
  }

  const bytes = readFileSync(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== face.sha256) fail(`${face.file}: sha256 ${digest} != manifest ${face.sha256}`);
  if (bytes.length !== face.bytes) fail(`${face.file}: ${bytes.length} bytes != manifest ${face.bytes}`);

  if (!css.includes(`url('${face.href}')`)) fail(`fonts.css does not reference ${face.href}`);
  if (!ts.includes(`'${face.href}'`)) fail(`fonts.generated.ts does not reference ${face.href}`);

  /*
   * The whole `font-variant-numeric` split rests on these being present. When
   * an OpenType feature is missing the browser does not warn — it renders the
   * default figures and the spec column silently stops being tabular.
   */
  const missing = manifest.requiredFeatures.filter((f) => !face.metrics.features.includes(f));
  if (missing.length) fail(`${face.file}: manifest is missing required features ${missing.join(', ')}`);
}

/* The font this design depends on has no `lnum`/`tnum`, because its default
 * figures are already lining and tabular. `.u-tabular` therefore works by
 * *resetting* the inherited old-style value, not by requesting a feature. A
 * font swap to one with proportional defaults would break every spec column
 * with nothing to see in the diff, so state the assumption here. */
for (const face of manifest.faces) {
  if (face.metrics.features.includes('tnum') || face.metrics.features.includes('lnum')) {
    fail(
      `${face.file} ships lnum/tnum. That is fine, but .u-tabular currently relies ` +
      'on the default figures being lining tabular — revisit global.css before ' +
      'updating this check.',
    );
  }
}

/* A fallback face with no metric overrides is worse than no fallback face: it
 * swaps at a different size and moves every line on the page. */
if (!manifest.fallbacks.length) fail('manifest declares no metric-adjusted fallbacks');

for (const fb of manifest.fallbacks) {
  for (const [key, value] of Object.entries({
    'size-adjust': fb.sizeAdjust,
    'ascent-override': fb.ascentOverride,
    'descent-override': fb.descentOverride,
  })) {
    if (!(value > 0)) fail(`${fb.family} (${fb.style}): ${key} is ${value}`);
  }
  if (!css.includes(`font-family: '${fb.family}';`)) {
    fail(`fonts.css declares no @font-face for the fallback ${fb.family}`);
  }
  if (!tokens.includes(`'${fb.family}'`)) {
    fail(`tokens.css font stack does not name the fallback ${fb.family}`);
  }
}

/* The fallback only helps if it sits between the webfont and the generic
 * stack. A stack that goes straight to system-ui skips it entirely. */
const stack = /--f-sans:\s*([^;]+);/.exec(tokens)?.[1] ?? '';
const webfontAt = stack.indexOf(`'${manifest.family}'`);
if (webfontAt !== 0) fail(`--f-sans must start with '${manifest.family}' — got: ${stack.trim()}`);
for (const fb of manifest.fallbacks) {
  if (stack.indexOf(`'${fb.family}'`) < webfontAt) {
    fail(`--f-sans lists ${fb.family} before the webfont`);
  }
}

if (!globalCss.includes("@import './fonts.css'")) fail('global.css does not import fonts.css');

/* Preload the roman only. Preloading the italic as well would download 60 KB
 * on every page for text most pages do not have. */
const roman = manifest.faces.find((f) => f.style === 'normal');
const italic = manifest.faces.find((f) => f.style === 'italic');
if (!layout.includes('rel="preload"') || !layout.includes('fontFiles.roman')) {
  fail('BaseLayout does not preload the roman face from fontFiles');
}
if (layout.includes('fontFiles.italic')) fail('BaseLayout preloads the italic face — it should not');
if (!layout.includes('crossorigin')) fail('font preload is missing crossorigin — it will download twice');

/*
 * The open-graph fonts. Static instances of the same upstream, read by satori
 * at build time — see src/lib/og.ts — and committed under data/ because nothing
 * serves them.
 *
 * Unlike the woff2 subsets these ARE byte-reproducible (`recalcTimestamp=False`
 * in build-fonts.py), so a digest mismatch here is a real change rather than a
 * rebuild on a different fontTools. They are also checked for NOT being under
 * public/: shipping them would put 58 KB of duplicate letterforms into the font
 * budget for bytes no browser ever needs.
 */
const og = manifest.openGraph;
if (!og) {
  fail('data/fonts.json has no openGraph block — run `bun run fonts:build:og`');
} else {
  for (const face of og.faces) {
    const path = resolve(root, og.dir, face.file);
    if (!existsSync(path)) {
      fail(`${face.file} is missing from ${og.dir} — run \`bun run fonts:build:og\``);
      continue;
    }
    const bytes = readFileSync(path);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== face.sha256) fail(`${face.file}: sha256 ${digest} != manifest ${face.sha256}`);
    if (bytes.length !== face.bytes) fail(`${face.file}: ${bytes.length} bytes != manifest ${face.bytes}`);

    if (existsSync(resolve(root, 'public/fonts', face.file))) {
      fail(`${face.file} is in public/fonts — the OG fonts are a build input and must not be served`);
    }
  }
}

const total = manifest.faces.reduce((n, f) => n + f.bytes, 0);
/* lighthouse-budget.json allows 160 KB of font. Both faces load only on a page
 * with italic text, so that is the number to hold. */
const BUDGET_KB = 160;
if (total / 1024 > BUDGET_KB) fail(`fonts total ${(total / 1024).toFixed(1)} KB, over the ${BUDGET_KB} KB budget`);

console.log(
  `\nfonts: ${manifest.faces.length} faces, ${manifest.fallbacks.length} metric-adjusted fallbacks, ` +
  `${(roman.bytes / 1024).toFixed(1)} KB preloaded / ${(total / 1024).toFixed(1)} KB worst case ` +
  `(italic ${(italic.bytes / 1024).toFixed(1)} KB on demand), ` +
  `${og ? og.faces.length : 0} unserved OG faces, ${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

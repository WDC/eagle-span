#!/usr/bin/env node
/**
 * Gates on the content model that the build cannot cover.
 *
 * `astro build` already validates the content itself: Zod rejects a missing
 * meta description or a testimonial with no name, and `@astrojs/markdoc`
 * rejects an undeclared tag or a mistyped attribute. What it cannot see is the
 * shape around the content:
 *
 *   1. **A tag with no renderer.** `component('./src/components/markdoc/X.astro')`
 *      is a string until a page renders that tag, so a typo in a path survives
 *      every build until the one page that uses it exists.
 *   2. **A missing singleton.** `src/content/pages/home.mdoc` is required, and
 *      a build that renders no page from it does not notice it is gone.
 *   3. **An orphan file.** A directory renamed on one side of the model leaves
 *      the old files behind, still in the repo, read by nothing. Silent, and
 *      exactly what content-paths.ts exists to prevent — this is the check
 *      that proves it worked.
 *
 * Paths and tags come from the same modules the two configs read, so this
 * cannot drift from what it is checking.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

import { CONTENT_DIR, LOCATIONS, expectedPaths } from '../src/lib/content-paths.ts';
import { NODE_COMPONENTS, TAGS } from '../src/lib/markdoc-tags.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  ✗ ${message}`);
};

/*
 * Documentation, not content. `NOTES.md` is how a deliberately empty collection
 * explains itself — see src/content/testimonials/NOTES.md — and the loaders
 * glob for `.mdoc` and `.yaml`, so it is not an orphan.
 */
const NOT_CONTENT = new Set(['.md']);

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

/* 1. Every declared tag has a component to render it. */
for (const tag of TAGS) {
  if (!existsSync(resolve(root, tag.component))) {
    fail(`{% ${tag.name} %} renders ${tag.component}, which does not exist`);
  }
}

/*
 * ...and so does every node we render ourselves. `document` and `link` are not
 * tags an editor inserts, so no content file exercises them by name — a typo in
 * either path would only surface as a broken page.
 */
for (const [node, componentPath] of Object.entries(NODE_COMPONENTS)) {
  if (!existsSync(resolve(root, componentPath))) {
    fail(`the ${node} node renders ${componentPath}, which does not exist`);
  }
}

/* 2. Every collection has its directory, and every singleton has its file. */
const claimed = new Set();
for (const name of Object.keys(LOCATIONS)) {
  const { directory, file, ext } = expectedPaths(name);

  if (!existsSync(resolve(root, directory))) {
    fail(`${name}: ${directory} does not exist. Keystatic writes there and the loader reads it.`);
    continue;
  }

  if (file) {
    if (existsSync(resolve(root, file))) claimed.add(resolve(root, file));
    else fail(`${name} is a singleton and ${file} is missing. Create it in /keystatic.`);
    continue;
  }

  for (const found of walk(resolve(root, directory))) {
    if (extname(found) === `.${ext}`) claimed.add(found);
  }
}

/*
 * 3. No image on the site is missing its alt text.
 *
 * A routed entry gets this from `withHeroAlt` in the content config. A page
 * singleton cannot: refining its schema turns it into a `ZodEffects`, and
 * Astro then types the whole collection as `Record<string, any>` — see the
 * comment on `pageBase`. So the pairing is checked here, textually, across
 * every content file at once. That is a weaker check than a schema, and it is
 * the only one available that does not cost the templates their types.
 *
 * Both spellings are covered: `hero:`/`heroAlt:` at the top level of a routed
 * entry or a page, and the homepage's nested `image:`/`imageAlt:` under
 * `hero:`. An image without alt text was the one accessibility regression the
 * Phase 0 audit said this migration must not ship.
 */
const frontmatterOf = (text) => {
  if (!text.startsWith('---\n')) return '';
  const end = text.indexOf('\n---', 3);
  return end === -1 ? '' : text.slice(4, end);
};

for (const found of walk(resolve(root, CONTENT_DIR))) {
  if (extname(found) !== '.mdoc') continue;
  const front = frontmatterOf(readFileSync(found, 'utf8'));
  const where = relative(root, found);

  if (/^hero:[ \t]*\S/m.test(front) && !/^heroAlt:[ \t]*\S/m.test(front)) {
    fail(`${where}: hero is set and heroAlt is not. Every image on this site carries alt text.`);
  }
  if (/^[ \t]+image:[ \t]*\S/m.test(front) && !/^[ \t]+imageAlt:[ \t]*\S/m.test(front)) {
    fail(`${where}: hero.image is set and hero.imageAlt is not. Every image on this site carries alt text.`);
  }
}

/* 4. Nothing under src/content is read by nobody. */
for (const found of walk(resolve(root, CONTENT_DIR))) {
  if (claimed.has(found) || NOT_CONTENT.has(extname(found))) continue;
  fail(`${relative(root, found)} is not read by any collection. A leftover from a rename?`);
}

const collections = Object.values(LOCATIONS).filter((l) => l.kind === 'collection').length;
const singletons = Object.keys(LOCATIONS).length - collections;
console.log(
  `\ncontent: ${collections} collections, ${singletons} singletons, ${TAGS.length} tags, ` +
  `${Object.keys(NODE_COMPONENTS).length} nodes, ` +
  `${claimed.size} entries, ${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

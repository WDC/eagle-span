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
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

import { CONTENT_DIR, LOCATIONS, expectedPaths } from '../src/lib/content-paths.ts';
import { TAGS } from '../src/lib/markdoc-tags.ts';

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

/* 3. Nothing under src/content is read by nobody. */
for (const found of walk(resolve(root, CONTENT_DIR))) {
  if (claimed.has(found) || NOT_CONTENT.has(extname(found))) continue;
  fail(`${relative(root, found)} is not read by any collection. A leftover from a rename?`);
}

const collections = Object.values(LOCATIONS).filter((l) => l.kind === 'collection').length;
const singletons = Object.keys(LOCATIONS).length - collections;
console.log(
  `\ncontent: ${collections} collections, ${singletons} singletons, ${TAGS.length} tags, ` +
  `${claimed.size} entries, ${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

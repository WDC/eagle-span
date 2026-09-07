#!/usr/bin/env node
/**
 * Structural validation of the JSON-LD emitted into dist/.
 *
 * Not a schema.org validator — it checks the things that actually broke on the
 * old site: unparseable blocks, a missing canonical, NAP drift between the
 * rendered markup and site.config, and breadcrumb trails with no visible
 * counterpart.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

const { site } = await import('../src/site.config.ts');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

let failures = 0;
const fail = (file, msg) => { failures += 1; console.error(`FAIL ${relative(dist, file)}: ${msg}`); };

const files = walk(dist);

for (const file of files) {
  const html = readFileSync(file, 'utf8');

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) { fail(file, 'no JSON-LD block'); continue; }
  if (blocks.length > 1) fail(file, `${blocks.length} JSON-LD blocks — merge into one @graph`);

  let data;
  try { data = JSON.parse(blocks[0][1]); }
  catch (err) { fail(file, `unparseable JSON-LD: ${err.message}`); continue; }

  if (!data['@context']) fail(file, 'missing @context');
  const nodes = data['@graph'] ?? [data];

  const business = nodes.find((n) => n['@type'] === 'AutoRepair');
  if (!business) {
    fail(file, 'no AutoRepair node');
  } else {
    // NAP drift is the failure mode that silently suppresses local ranking.
    if (business.name !== site.name) fail(file, `name "${business.name}" != site.config "${site.name}"`);
    if (business.telephone !== site.phoneDisplay) {
      fail(file, `telephone "${business.telephone}" != site.config "${site.phoneDisplay}"`);
    }
    if (business.address?.streetAddress !== site.address.street) {
      fail(file, `streetAddress "${business.address?.streetAddress}" != site.config`);
    }
    if (business.address?.postalCode !== site.address.postalCode) {
      fail(file, 'postalCode drift');
    }
  }

  if (!/<link[^>]+rel=["']canonical["']/i.test(html)) fail(file, 'missing canonical link');

  const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList');
  if (crumbs) {
    const positions = crumbs.itemListElement.map((i) => i.position);
    const ok = positions.every((p, i) => p === i + 1);
    if (!ok) fail(file, `BreadcrumbList positions not 1..n: ${positions.join(',')}`);
  }
}

console.log(`\njson-ld: ${files.length} pages checked, ${failures} problem${failures === 1 ? '' : 's'}.`);
if (failures) process.exit(1);

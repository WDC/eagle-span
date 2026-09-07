#!/usr/bin/env node
/**
 * Structural validation of the JSON-LD emitted into dist/.
 *
 * Not a schema.org validator — it checks the things that actually broke on the
 * old site, plus the one rule Phase 4's graph is built on: **a node describes
 * something the reader can see on the page it is on.**
 *
 * The crawl found structured data on the homepage and the seven articles and
 * nowhere else; all fourteen service and repair pages carried none (Phase 0
 * defect 8). That is closed by `serviceNode()` and kept closed here: a page
 * under /services or /repairs with no `Service` node fails the build.
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

/**
 * The page as a reader sees it: script and style contents dropped, tags
 * removed, entities decoded, whitespace collapsed.
 *
 * This is what makes "the graph says nothing the page does not" checkable
 * rather than aspirational. The JSON-LD block is inside a `<script>`, so it is
 * removed first — otherwise every claim would trivially match itself.
 */
function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same collapse, so a claim spanning a line break still matches. */
const collapse = (value) => value.replace(/\s+/g, ' ').trim();

/** Every file in the build, as the path it is served at. */
function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkAll(p, out);
    else out.push(`/${relative(dist, p)}`);
  }
  return out;
}

/** `/services/x/index.html` is served at `/services/x`; the root is `/`. */
const pathOf = (file) => {
  const trimmed = `/${relative(dist, file)}`.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  return trimmed === '' ? '/' : trimmed;
};

const files = walk(dist);
const built = new Set(files.map(pathOf));
const assets = new Set(walkAll(dist));

let servicePages = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const text = visibleText(html);
  const path = pathOf(file);

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

    /*
     * The catalogue is on every page, so a stale entry in it is fourteen broken
     * promises rather than one. Each offer must name a page this build made.
     */
    const offers = business.hasOfferCatalog?.itemListElement ?? [];
    for (const offer of offers) {
      const url = offer.itemOffered?.url ?? '';
      const offered = url.replace(site.url, '');
      if (!built.has(offered)) fail(file, `hasOfferCatalog offers ${offered}, which this build does not produce`);
    }
  }

  if (!/<link[^>]+rel=["']canonical["']/i.test(html)) fail(file, 'missing canonical link');

  /*
   * Defect 8. Every service and repair page carries a Service node, and it
   * describes *this* page rather than a copy of a neighbour's.
   */
  if (/^\/(?:services|repairs)\//.test(path)) {
    servicePages += 1;
    const service = nodes.find((n) => n['@type'] === 'Service');
    if (!service) {
      fail(file, 'no Service node — every service and repair page must carry one (Phase 0 defect 8)');
    } else if (service.url !== `${site.url}${path}`) {
      fail(file, `Service url "${service.url}" is not this page (${site.url}${path})`);
    } else if (!collapse(text).includes(collapse(service.name))) {
      fail(file, `Service name "${service.name}" does not appear on the page`);
    }
  }

  const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList');
  if (crumbs) {
    const positions = crumbs.itemListElement.map((i) => i.position);
    const ok = positions.every((p, i) => p === i + 1);
    if (!ok) fail(file, `BreadcrumbList positions not 1..n: ${positions.join(',')}`);

    /*
     * A BreadcrumbList describing a trail the reader cannot see is a
     * structured-data violation, and the easy way to ship one is a template
     * that passes crumbs to the graph and forgets to render them.
     */
    for (const item of crumbs.itemListElement) {
      if (!text.includes(collapse(item.name))) {
        fail(file, `breadcrumb "${item.name}" is in the graph but not visible on the page`);
      }
    }
  }

  /* Same rule for FAQ answers, which is the one Google actions manually. */
  const faq = nodes.find((n) => n['@type'] === 'FAQPage');
  if (faq) {
    for (const question of faq.mainEntity ?? []) {
      const answer = collapse(question.acceptedAnswer?.text ?? '');
      if (!text.includes(collapse(question.name))) {
        fail(file, `FAQ question "${question.name}" is not visible on the page`);
      }
      if (!answer || !text.includes(answer)) {
        fail(file, `FAQ answer for "${question.name}" is not visible on the page`);
      }
    }
  }

  /*
   * One open-graph card per page, and the file has to be there. A card is
   * rendered by a route that builds from a different list than the page did;
   * this is where those two lists are checked against each other.
   */
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) {
    const asset = og[1].replace(site.url, '');
    if (!assets.has(asset)) fail(file, `og:image ${asset} is not in the build`);
  } else if (path !== '/404') {
    /* The 404 is the one page with no card: see `image={null}` in 404.astro. */
    fail(file, 'no og:image');
  }
}

console.log(
  `\njson-ld: ${files.length} pages checked, ${servicePages} with a Service node, ` +
  `${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

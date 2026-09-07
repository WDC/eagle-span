import type { APIRoute } from 'astro';

import { site } from '~/site.config.ts';

/**
 * `robots.txt`.
 *
 * Webflow generated one; nothing in this repo did, which would have left the
 * new site with a sitemap at a path no crawler is told about. There is nothing
 * to disallow — every route is meant to be crawled, and the pages that are not
 * say so with a `noindex` meta tag, which is the mechanism that actually works.
 * A `Disallow` on a page you want de-indexed prevents the crawl that would read
 * the tag.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${site.url}/sitemap.xml`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );

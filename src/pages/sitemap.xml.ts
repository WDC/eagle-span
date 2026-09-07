import type { APIRoute } from 'astro';

import { lastmodFor, lastmodSourceNote } from '~/lib/lastmod.ts';
import { listSitePages } from '~/lib/pages.ts';
import { site } from '~/site.config.ts';

/**
 * The sitemap, written by hand rather than by `@astrojs/sitemap`.
 *
 * The integration derives its URL list by scanning built routes, which it does
 * well, and it has no way to answer the question this phase is actually about:
 * *when did this page last change?* Its `lastmod` is the build time, because
 * that is the only date a route scanner has. Phase 1 left it in place with a
 * note saying Phase 4 would replace it with real values read from the content
 * collections — and this endpoint is inside the Astro runtime, so it can.
 *
 * The trade is one file of XML string-building against a second source of truth
 * about which pages exist. `src/lib/pages.ts` is the first one and the OG cards
 * already build from it; a sitemap built from a different derivation is how a
 * page ends up with a card and no sitemap row, or the reverse.
 *
 * `/sitemap.xml`, not `/sitemap-index.xml`: it is the path the live Webflow
 * site serves, it is what Search Console already has on file, and fourteen URLs
 * are four orders of magnitude short of needing an index.
 */
export const prerender = true;

/*
 * `&`, `<` and `>` in a URL would break the document. No URL on this site
 * contains one today; a slug that eventually does should not be the thing that
 * makes the sitemap unparseable.
 */
const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async () => {
  const pages = await listSitePages();

  /*
   * A `noindex` page in a sitemap is a contradiction: the sitemap asks for it
   * to be crawled and indexed and the meta tag refuses. Drafts never reach
   * `listSitePages` at all — `listPublished` filters them upstream, where every
   * route reads from.
   */
  const indexable = pages.filter((page) => !page.noindex);

  const note = lastmodSourceNote();
  if (note) console.warn(`[sitemap] ${note}`);

  const rows = indexable
    .map((page) => {
      const lastmod = lastmodFor(page);
      const loc = `${site.url}${page.path === '/' ? '/' : page.path}`;
      return [
        '  <url>',
        `    <loc>${xml(loc)}</loc>`,
        /* Date only. The W3C profile allows a full timestamp; the hour a
           service page's copy changed is not information a crawler needs. */
        ...(lastmod ? [`    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>`] : []),
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};

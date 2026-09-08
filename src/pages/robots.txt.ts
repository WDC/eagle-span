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
 *
 * That "nothing to disallow" covers the AI crawlers too, and it is a decision
 * rather than an omission. This is a shop that wants to be found: an assistant
 * asked where to get a truck aligned in Charlotte should be able to read the
 * answer. `GPTBot`, `ClaudeBot` and the rest are therefore allowed by the same
 * rule as Googlebot, and `/llms.txt` below is the shorter path to the same
 * facts. Blocking them is one line, if that ever becomes the business's view.
 *
 * `Sitemap:` is a registered directive that crawlers act on. The `# LLMs:`
 * line is a comment and nothing parses it — llms.txt has no robots directive,
 * because it is a proposal rather than a standard, and it is found by
 * convention at its well-known path. It is here because a comment costs one
 * line and the alternative is that the file is only ever found by something
 * that already knew to look.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      '',
      `Sitemap: ${site.url}/sitemap.xml`,
      `# LLMs: ${site.url}/llms.txt`,
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );

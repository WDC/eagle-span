import type { APIRoute } from 'astro';

import { renderOgImage } from '~/lib/og.ts';
import { listSitePages } from '~/lib/pages.ts';
import { ogPath } from '~/lib/routes.ts';

/**
 * `/og/{page}.png` — one open-graph card per page, written at build.
 *
 * `prerender` is explicit rather than inherited. The whole site is static and
 * `verify:static-build` fails on any serverless function reaching the deployed
 * output, so an endpoint that quietly became dynamic would be caught — but it
 * would be caught late, and this is the file where the mistake is easiest to
 * make.
 *
 * The URL is derived by `ogPath()`, which `BaseLayout` also calls to write the
 * `og:image` meta. Two derivations of the same name would be two chances to
 * ship a card nothing points at.
 */
export const prerender = true;

export async function getStaticPaths() {
  const pages = await listSitePages();

  return pages.map((page) => ({
    /*
     * `[...slug]` matches the path between `/og/` and `.png`, so the slug is
     * the page path with its leading slash removed — and the homepage, whose
     * path is bare `/`, becomes `index`.
     */
    params: { slug: ogPath(page.path).replace(/^\/og\//, '').replace(/\.png$/, '') },
    props: { eyebrow: page.eyebrow, title: page.title },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgImage({ eyebrow: props.eyebrow, title: props.title });

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      /* Immutable is wrong: the URL has no content hash and the card changes when the title does. */
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
};

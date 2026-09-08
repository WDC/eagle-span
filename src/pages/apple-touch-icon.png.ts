import type { APIRoute } from 'astro';

import { iconPng } from '~/lib/icon.ts';

/**
 * `/apple-touch-icon.png` — the icon iOS uses when someone adds the site to
 * their home screen, and the one several link-preview services fall back to
 * when a page offers no other raster.
 *
 * 180×180 is the largest size Apple asks for, and every smaller one is
 * downscaled from it. `radius: 0` because iOS applies its own rounded mask: an
 * icon that arrives pre-rounded is rounded twice and shows dark corners inside
 * the mask.
 *
 * `prerender` is explicit for the same reason it is in the OG route — this is
 * the kind of endpoint where "it renders an image, so it must need a server" is
 * an easy wrong turn, and `verify:static-build` would catch it late.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(iconPng(180, { radius: 0 }), {
    headers: {
      'Content-Type': 'image/png',
      /* Not immutable: the URL carries no content hash, and the mark is a
         stand-in that will be replaced. */
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });

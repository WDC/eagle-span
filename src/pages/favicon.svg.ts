import type { APIRoute } from 'astro';

import { iconSvg } from '~/lib/icon.ts';

/**
 * `/favicon.svg` — the tab icon, and the one a browser prefers when it is
 * offered both.
 *
 * A route rather than a file in `public/` so that it and the PNG below it
 * cannot come apart: both call `iconSvg()`, so there is one drawing and two
 * encodings of it. `public/` would be a second copy maintained by hand.
 *
 * One SVG covers every modern browser at every size, including the 16px tab and
 * the 64px bookmark, from the same 700-odd bytes. There is deliberately no
 * `/favicon.ico`: the browsers that need one are the ones this site's baseline
 * — nested CSS, scroll-driven animation, view transitions — already excludes.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(iconSvg({ radius: 7 }), {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  });

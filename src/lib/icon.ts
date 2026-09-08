import { Resvg } from '@resvg/resvg-js';

/**
 * The site icon, drawn once and rasterised where a raster is required.
 *
 * **This is a stand-in, and it is the second one on the site.** The real mark
 * is `src/assets/brand/eaglespan-logo.png`: an eagle in flight under a blue
 * arc, over a two-colour wordmark and the word "Corporation". It is a lockup,
 * not a mark — at 16 pixels it is a grey smudge, and cropping a usable mark out
 * of a 745px raster is a design decision with a designer in it, not a build
 * step. So this draws the one element of that logo that survives being small:
 * the arc, in the site's own blue, on the site's own ink, with a rule under it.
 *
 * The alternative was shipping nothing, which is what the repository did until
 * now — no `<link rel="icon">` and no `/favicon.ico`, so every browser and
 * crawler that asked for one got a 404, and Google, which shows a favicon
 * beside every mobile search result, had nothing to show. A stand-in that
 * reads at 16px is worth more than that, and like `src/lib/placeholders.ts` it
 * is written down as temporary rather than left to be discovered.
 *
 * Replacing it is replacing `MARK` with the real artwork's paths. Nothing else
 * changes: both routes and every `<link>` in `BaseLayout` derive from here.
 *
 * ## Why two shapes
 *
 * A browser tab wants a rounded tile it can draw on any background. iOS masks
 * an `apple-touch-icon` with its own rounded rectangle, so an icon that arrives
 * pre-rounded gets rounded twice and shows a dark halo in the corners. Same
 * mark, one flag.
 */

/* From src/styles/tokens.css. There is no cascade in a standalone SVG file to
   read a `var()` out of; `verify:tokens` keeps the originals honest. */
const INK = '#0a0a0b';
const BLUE = '#0b66e4';
const ON_DEEP = '#f5f7f8';

/**
 * The mark itself, on a 32-unit grid: an arc spanning the width with a rule
 * beneath it. Optically centred rather than mathematically — the round caps
 * extend two units past each end of the arc, so the drawn extent is y 7 to 25,
 * which puts its middle on 16.
 */
const MARK = [
  `<path d="M5.5 19.5a10.5 10.5 0 0 1 21 0" fill="none" stroke="${BLUE}" stroke-width="4" stroke-linecap="round"/>`,
  `<rect x="3.5" y="22.5" width="25" height="2.5" rx="1.25" fill="${ON_DEEP}"/>`,
].join('');

export interface IconOptions {
  /**
   * Corner radius of the ground, in grid units. `0` is full-bleed, for the
   * platforms that apply their own mask.
   */
  radius: number;
}

/** The icon as an SVG document. */
export function iconSvg({ radius }: IconOptions): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Eagle Span Corporation">',
    `<rect width="32" height="32" rx="${radius}" fill="${INK}"/>`,
    MARK,
    '</svg>',
  ].join('');
}

/**
 * The icon as PNG bytes at `size` square.
 *
 * resvg is already a dependency — it is what rasterises the open-graph cards —
 * and it runs in-process during `astro build`, so this stays a static file in
 * the output rather than becoming a second serverless function. The `Buffer` it
 * returns is a view onto a pooled ArrayBuffer and `Response` wants a plain one,
 * which is why the bytes are copied; `src/lib/og.ts` says the same thing.
 */
export function iconPng(size: number, options: IconOptions): Uint8Array<ArrayBuffer> {
  const rendered = new Resvg(iconSvg(options), { fitTo: { mode: 'width', value: size } }).render();

  return new Uint8Array(rendered.asPng());
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

import { site } from '~/site.config.ts';

/**
 * One open-graph card per page, drawn at build time.
 *
 * Not a screenshot and not a headless browser: satori lays out a small subset
 * of flexbox and CSS into SVG, and resvg rasterises it. Both run in-process
 * during `astro build`, so the site keeps its "no serverless function" property
 * — `verify:static-build` would fail the moment an OG route needed a runtime.
 *
 * The card is the site's own visual language rather than a generic template:
 * a rail label, a hairline, the headline, and the NAP along the bottom. It is
 * set in the same letterforms as the page, which is the whole reason the fonts
 * below exist.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/*
 * Palette, from src/styles/tokens.css. Duplicated as hex because satori has no
 * cascade and no custom properties — there is no stylesheet here to read a
 * `var()` out of. Four values, and `verify-tokens.mjs` is what keeps the
 * originals honest.
 */
const INK = '#0a0a0b';
const INK_2 = '#26272b';
const INK_3 = '#55575e';
const RULE = '#d2d2ce';
const GROUND = '#ffffff';

const FONT_FAMILY = 'Eagle Span Sans';

/**
 * satori reads ttf, otf and woff — not woff2, and not a variable font's named
 * instances. So these are static instances built by `scripts/build-fonts.py`
 * from the same pinned upstream as the shipped webfont, subset the same way,
 * and committed under `data/` because nothing serves them.
 *
 * Read once per build rather than once per page: fourteen pages is fourteen
 * reads of the same 58 KB otherwise.
 */
let fontCache: { name: string; data: Buffer; weight: 400 | 600; style: 'normal' }[] | null = null;

function fonts() {
  if (fontCache) return fontCache;

  const load = (file: string) => {
    const path = resolve(process.cwd(), 'data/og-fonts', file);
    try {
      return readFileSync(path);
    } catch {
      throw new Error(
        `OG font ${file} is missing. Run \`bun run fonts:build:og\` — it is a committed build input, not a downloaded one.`,
      );
    }
  };

  fontCache = [
    { name: FONT_FAMILY, data: load('eagle-span-og-regular.ttf'), weight: 400, style: 'normal' },
    /*
     * The file is the 620 instance — heading weight from tokens.css — declared
     * to satori as 600 because satori matches on the standard numeric ladder.
     * The weight in the file is what draws; this number only selects it.
     */
    { name: FONT_FAMILY, data: load('eagle-span-og-semibold.ttf'), weight: 600, style: 'normal' },
  ];
  return fontCache;
}

/**
 * Headline size, from length.
 *
 * Three steps rather than a continuous fit: an SEO title is bounded at 70
 * characters by the content schema, so there are only about three lengths this
 * ever has to handle, and a measured auto-fit would be a lot of arithmetic to
 * arrive at the same three numbers.
 */
function headlineSize(text: string): number {
  if (text.length <= 38) return 78;
  if (text.length <= 62) return 64;
  return 52;
}

export interface OgCard {
  /** The rail label: which part of the site this is. */
  eyebrow: string;
  /** `seo.title`, without the brand suffix — the card carries the brand below. */
  title: string;
}

/*
 * satori needs `display: flex` on anything with more than one child and has no
 * `display: block`, so every container below says so explicitly. The tree is
 * written as plain objects rather than JSX because this is a `.ts` module and
 * adding a JSX pragma to reach three nested divs is not a trade worth making.
 */
const el = (style: Record<string, unknown>, children: unknown) => ({ type: 'div', props: { style, children } });

function card({ eyebrow, title }: OgCard) {
  return el(
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: '100%',
      height: '100%',
      backgroundColor: GROUND,
      color: INK,
      fontFamily: FONT_FAMILY,
      padding: '64px 72px',
    },
    [
      /* The rail label, over the hairline the whole design hangs off. */
      el(
        {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderBottom: `1px solid ${RULE}`,
          paddingBottom: 20,
          fontSize: 22,
          letterSpacing: 3,
          color: INK_3,
          textTransform: 'uppercase',
        },
        [
          el({ display: 'flex' }, eyebrow),
          el({ display: 'flex' }, site.shortName),
        ],
      ),

      el(
        {
          display: 'flex',
          fontSize: headlineSize(title),
          fontWeight: 600,
          lineHeight: 1.08,
          letterSpacing: -1,
          /* The measure, not the card: a headline running the full 1056px reads as a banner. */
          maxWidth: 980,
        },
        title,
      ),

      /*
       * The NAP, in the format site.config declares and nothing else. An OG
       * card is a place a phone number gets retyped in a sixth format.
       */
      el(
        {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderTop: `1px solid ${RULE}`,
          paddingTop: 20,
          fontSize: 26,
          color: INK_2,
        },
        [
          el(
            { display: 'flex' },
            `${site.address.street}, ${site.address.locality}, ${site.address.region} ${site.address.postalCode}`,
          ),
          el({ display: 'flex' }, site.phoneDisplay),
        ],
      ),
    ],
  );
}

/**
 * Renders one card to PNG bytes.
 *
 * resvg hands back a Node `Buffer`, which is a view onto a pooled ArrayBuffer;
 * `Response` wants a view onto a plain one. Copying is the honest fix — the
 * alternative is casting away a difference that is real.
 */
export async function renderOgImage(options: OgCard): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await satori(card(options) as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: fonts(),
  });

  return new Uint8Array(new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng());
}

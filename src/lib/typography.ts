/**
 * The text pipeline: smartypants → nbsp → widont → normalization.
 *
 * Two callers, one implementation:
 *
 *   * `src/lib/remark-typography.ts` runs stages 2–4 over markdown text nodes.
 *     Astro applies remark-smartypants before any user plugin, so stage 1 is
 *     already done by the time the plugin sees the tree.
 *   * `typo()` runs all four over a plain string, for the copy that lives in
 *     `.astro` files and in frontmatter, which markdown never touches.
 *
 * `scripts/lint-typography.mjs` imports `UNITS` from here so the CI gate and
 * the pipeline cannot disagree about what a unit is.
 *
 * The lint and the pipeline are deliberately both switched on. The lint is the
 * gate on what gets *written*: source copy has to be correct, because a build
 * step that quietly fixes straight quotes trains everyone to stop caring, and
 * the fix is not available to the copy that leaves this repo (GBP posts, meta
 * descriptions pasted into a spreadsheet, anything a human copies off the
 * page). The pipeline is what handles the things a writer genuinely cannot do
 * by hand — nbsp before every unit, orphan control on generated headings — and
 * a safety net under migrated Webflow copy that has not been through review.
 */

const NBSP = '\u00a0';

/**
 * Units that must never be separated from their figure by a line break.
 *
 * Ordered longest-first so the alternation cannot match `in` inside `in.` or
 * `lb` inside `lbs`. Case-sensitive: `In` at the start of a sentence is the
 * preposition, and binding it to the number before it would be wrong.
 */
export const UNITS = [
  'lbs',
  'psi',
  'gal',
  'rpm',
  'mph',
  'kg',
  'lb',
  'in',
  'ft',
  'mm',
  'cm',
  'mi',
  'hp',
  'qt',
  'oz',
  'hr',
  'ah',
] as const;

/** Units written as a symbol, which close up against the figure entirely. */
export const SYMBOL_UNITS = ['°', '″', '′', '%'] as const;

const UNIT_ALTERNATION = UNITS.join('|');
const SYMBOL_UNIT_CLASS = `[${SYMBOL_UNITS.join('')}]`;

/** A figure, allowing a decimal point, a thousands comma and a leading sign. */
const FIGURE = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`;

/**
 * Stage 1 — smartypants, for strings that never pass through markdown.
 *
 * Deliberately the same transformations remark-smartypants makes, so a heading
 * written in `.astro` and the same heading written in `.md` come out
 * identically. Markdown content must NOT be run through this: it would double
 * up on what Astro already did.
 */
export function smartypants(text: string): string {
  return (
    text
      // Dashes before quotes: an em dash is a legitimate opening context.
      .replace(/---/g, '—')
      .replace(/(?<!-)--(?!-)/g, '–')
      // Opening double quote: start of string, or after space or an opener.
      .replace(/(^|[\s([{—–])"/g, '$1“')
      .replace(/"/g, '”')
      // Apostrophe inside or after a word — possessives and contractions.
      .replace(/(?<=\w)'(?=\w)/g, '’')
      .replace(/(?<=\w)'(?!\w)/g, '’')
      // Elided year: '26.
      .replace(/'(?=\d\d\b)/g, '’')
      .replace(/(^|[\s([{—–])'/g, '$1‘')
      .replace(/'/g, '’')
  );
}

/**
 * Stage 2 — bind figures to their units with a non-breaking space.
 *
 * A measurement that wraps between the number and the unit is the single most
 * common typographic failure on a spec sheet, and it is invisible until the
 * viewport is exactly the wrong width.
 *
 * Phone numbers are handled in CSS (`.u-nowrap`), not here: the NAP has to stay
 * byte-identical to the Google Business Profile, and swapping in a U+00A0 would
 * make the rendered markup differ from `site.config.ts` and from the JSON-LD.
 *
 * `in` and `ft` will occasionally bind a preposition — "open at 5 in the
 * morning" gets a non-breaking space it did not need. That costs one break
 * opportunity in a sentence that had plenty; dropping the two most common units
 * on a truck spec sheet to avoid it would cost a wrapped measurement.
 */
export function nbsp(text: string): string {
  return (
    text
      .replace(new RegExp(String.raw`(${FIGURE})[ \t]+(?=(?:${UNIT_ALTERNATION})\b)`, 'g'), `$1${NBSP}`)
      // A symbol unit closes up against its figure entirely.
      .replace(new RegExp(String.raw`(${FIGURE})[ \t]+(?=${SYMBOL_UNIT_CLASS})`, 'g'), '$1')
      // Dimensions read as one object: 24 × 8.25.
      .replace(new RegExp(String.raw`(${FIGURE})[ \t]*×[ \t]*(?=${FIGURE})`, 'g'), `$1${NBSP}×${NBSP}`)
      // A reference and its number: Class 8, Interstate 85, Suite 4.
      .replace(/\b(Class|Interstate|Suite|Ste|Bay|No|Fig|Step|Phase|Section|Highway|Route|US|SAE|DOT|FMCSA)\.?[ \t]+(?=\d)/g,
        (match) => match.replace(/[ \t]+$/, NBSP))
  );
}

/**
 * Stage 3 — widont. Bind the last two words so a block never ends on a single
 * word alone on its own line.
 *
 * `text-wrap: pretty` and `text-wrap: balance` do this natively and better, and
 * both are already set in `global.css`. This is the fallback for the browsers
 * that have neither, and it has to be conservative for exactly that reason:
 * a non-breaking space is a hard constraint that can force horizontal overflow
 * on a narrow viewport, which is a worse bug than an orphan.
 */
export function widont(text: string): string {
  const words = text.trimEnd().split(/(\s+)/);
  if (words.length < 5) return text; // fewer than three words — nothing to orphan

  const last = words[words.length - 1];
  const separator = words[words.length - 2];

  if (last === undefined || separator === undefined) return text;
  // Only a plain space is safe to replace; a newline may be structural.
  if (separator !== ' ') return text;
  // A long last word will not fit beside its neighbour anyway, and binding it
  // is how a heading ends up wider than its column.
  if (last.length > 12) return text;

  const trailing = text.slice(text.trimEnd().length);
  return words.slice(0, -2).join('') + NBSP + last + trailing;
}

/**
 * Stage 4 — normalization. Characters that have a correct form and a lazy one.
 *
 * Everything here is also a lint rule, so on this repo's own copy it is a
 * no-op. It earns its place on migrated Webflow text, which does not pass
 * through the lint until someone has cleaned it.
 */
export function normalize(text: string): string {
  return (
    text
      .replace(/\.{3,}/g, '…')
      /*
       * `(tm)` has no other meaning, so it converts anywhere. `(c)` and `(r)`
       * do — an enumerated list runs (a), (b), (c) — so they convert only when
       * attached to a name, or when a copyright year follows.
       */
      .replace(/\(tm\)/gi, '™')
      .replace(/(?<=\w)\(c\)/gi, '©')
      .replace(/\(c\)(?=\s*\d{4}\b)/gi, '©')
      .replace(/(?<=\w)\(r\)/gi, '®')
      // 24 x 8 — a lowercase letter standing in for a multiplication sign.
      .replace(new RegExp(String.raw`(${FIGURE})\s*[x×]\s*(?=${FIGURE})`, 'g'), `$1${NBSP}×${NBSP}`)
      // 12 degrees / 12 deg / 12 ° — one degree sign, closed up.
      .replace(new RegExp(String.raw`(${FIGURE})\s*(?:degrees|degree|deg)\b`, 'gi'), '$1°')
      .replace(new RegExp(String.raw`(${FIGURE})\s+°`, 'g'), '$1°')
      /*
       * Feet and inches: 6'2" is a prime and a double prime. Only the pair is
       * converted, plus a lone foot mark. A bare 24" is left alone on purpose —
       * after smartypants it is indistinguishable from a closing quote at the
       * end of a sentence that happens to finish on a figure, and getting that
       * wrong is worse than not acting. `lint-typography` fails the build on it
       * instead, so it never reaches here from this repo's own copy.
       */
      .replace(/(\d)['’](\d+)["”]/g, '$1′$2″')
      .replace(/(\d)['’](?=[\s,.;:)]|$)/g, '$1′')
      /*
       * An hour or figure range takes an en dash. This runs before the minus
       * rule: `8 - 5` is a range, and a minus sign there would be wrong.
       */
      .replace(/\b(\d{1,2}(?::\d{2})?)\s*-\s*(?=\d{1,2}(?::\d{2})?\b)/g, '$1–')
      /*
       * A negative reading takes a minus sign, not a hyphen — but only where
       * the figure is unmistakably a reading, meaning it carries a unit.
       */
      .replace(new RegExp(String.raw`(^|[\s(])-(?=${FIGURE}(?:°|[ \t\u00a0](?:${UNIT_ALTERNATION})\b))`, 'g'), '$1−')
  );
}

export interface TypoOptions {
  /**
   * Bind the last two words. Off for `<title>` and meta descriptions, which do
   * not wrap in any surface that reads them.
   */
  widont?: boolean;
}

/**
 * The whole pipeline, for a plain string. Markdown gets stages 2–4 from the
 * remark plugin instead — running `smartypants` over it twice would turn an
 * already-curled quote into the wrong one.
 */
export function typo(text: string, options: TypoOptions = {}): string {
  const bound = nbsp(smartypants(text));
  return normalize(options.widont === false ? bound : widont(bound));
}

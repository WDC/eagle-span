/**
 * Placeholder photography.
 *
 * **Everything this module returns is temporary.** The design has always
 * assumed heavy photography in generous space — bays, techs, the alignment rig,
 * the exterior — and none of it exists yet: the Webflow asset export and the
 * shop shoot are both open blockers (ClickUp 86bbw07c4 and 86bbw07ex), so the
 * site has been rendering the design with its main visual ingredient missing.
 *
 * So the pass that adds the layouts also fills the slots, from a public
 * placeholder CDN, deterministically seeded per slot. Three decisions worth
 * keeping in mind:
 *
 *   1. **Seeded, not random per request.** `picsum.photos/seed/<seed>` returns
 *      the same photograph for the same seed forever, so a page does not shuffle
 *      its own art between builds and a review comment about "the third image"
 *      still means something tomorrow.
 *   2. **Obviously not the shop.** A stock photograph of a truck would be a lie
 *      the client could accidentally launch with. An unrelated photograph under
 *      a "Placeholder" badge cannot be mistaken for the real thing by anybody,
 *      which is the whole point of using this rather than something plausible.
 *   3. **One module.** Every placeholder on the site comes from here, so
 *      replacing them is deleting this file and following the type errors —
 *      not grepping fourteen templates for a CDN hostname.
 *
 * Two gates know about this. `lighthouse-budget.json` carries a temporary
 * third-party request allowance (it is 0 in the design and must go back to 0
 * with the real assets), and the CI link check skips the CDN rather than
 * hammering it with thirty requests a run.
 */

/** The one external origin this site talks to, and only while these ship. */
export const PLACEHOLDER_ORIGIN = 'https://picsum.photos';

export interface PlaceholderImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  /** Marks the slot in the markup, so the badge and the audit can find it. */
  readonly isPlaceholder: true;
}

/**
 * A placeholder for one image slot.
 *
 * `seed` names the slot rather than the picture — `home-shop-floor`, not
 * `truck-3` — because the seed is what survives into the replacement: when the
 * real photograph of the shop floor arrives, it goes where the slot named
 * `home-shop-floor` is.
 *
 * `alt` is required, and it describes the slot rather than the picture: the
 * picture is a stranger's photograph and saying it is the alignment rig would
 * be a lie told specifically to the reader who cannot see it. So it reads
 * `Placeholder — the alignment rig …`, which is true now and is a note to
 * whoever replaces it that the alt text has to be rewritten with the real
 * photograph. Alt text is the one accessibility thing the Webflow build got
 * right on every image; this is the version of that which is also honest.
 */
export function placeholder(
  seed: string,
  width: number,
  height: number,
  alt: string,
): PlaceholderImage {
  return {
    src: `${PLACEHOLDER_ORIGIN}/seed/${encodeURIComponent(seed)}/${width}/${height}`,
    width,
    height,
    alt,
    isPlaceholder: true,
  };
}

/**
 * The sizes the design actually asks for. Named rather than passed as numbers
 * at every call site, so the CDN is not asked for thirty slightly different
 * crops of the same aspect ratio.
 */
export const SIZES = {
  /** Full-bleed band and page-width hero art. */
  wide: [1600, 900],
  /** A panel or card thumbnail. */
  card: [960, 640],
  /** The portrait-ish column beside a body of copy. */
  column: [900, 1100],
  /** The map stand-in on the location block. */
  map: [1200, 800],
} as const satisfies Record<string, readonly [number, number]>;

/** `placeholder()` with one of the named sizes. */
export function placeholderAt(
  seed: string,
  size: keyof typeof SIZES,
  alt: string,
): PlaceholderImage {
  const [width, height] = SIZES[size];
  return placeholder(seed, width, height, alt);
}

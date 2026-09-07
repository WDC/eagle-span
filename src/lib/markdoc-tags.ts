/**
 * The Markdoc tag manifest — one declaration, two consumers.
 *
 * Markdoc rather than MDX is the whole point: an `.mdoc` file cannot import a
 * module or evaluate an expression, so the only things content can reach for
 * are the tags declared here. That is a real constraint rather than a stylistic
 * one, and it is what makes it safe to hand the content repo to an editor
 * later.
 *
 * The constraint only holds if the *editor* and the *renderer* agree about what
 * a tag is. Two hand-written lists would drift the first time an attribute was
 * renamed on one side, and nothing would fail until an editor saved a page and
 * the build rejected it. So neither side is hand-written:
 *
 *   * `markdoc.config.mjs` builds the Markdoc validation schema from this file,
 *     and the build fails on an undeclared tag or a mistyped attribute.
 *   * `keystatic.config.ts` builds the Keystatic content components from it, so
 *     the editor can only produce tags that validate.
 *
 * Adding a tag is therefore one entry here plus one `.astro` component;
 * `scripts/verify-content.mjs` fails if the component is missing.
 *
 * Kinds map onto both systems at once:
 *
 * | kind      | Markdoc                       | Keystatic          |
 * | --------- | ----------------------------- | ------------------ |
 * | `wrapper` | block tag with children       | `wrapper` component |
 * | `block`   | self-closing block tag        | `block` component   |
 * | `inline`  | self-closing tag inside prose | `inline` component  |
 */

/** A row in a `{% specs %}` table. Kept structural so the renderer can align it. */
export interface SpecRow {
  label: string;
  value: string;
  /** Optional qualifier: a tolerance, a standard, a condition of measurement. */
  note?: string;
}

export type TagAttribute =
  | {
      readonly name: string;
      readonly kind: 'string';
      readonly label: string;
      readonly description?: string;
      readonly required?: boolean;
      readonly multiline?: boolean;
      /** Rejected at build time and unselectable in the editor if it does not match. */
      readonly matches?: RegExp;
    }
  | {
      readonly name: string;
      readonly kind: 'select';
      readonly label: string;
      readonly description?: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly defaultValue: string;
    }
  | {
      readonly name: string;
      readonly kind: 'boolean';
      readonly label: string;
      readonly description?: string;
      readonly defaultValue: boolean;
    }
  /** An array of `SpecRow`. The one attribute that is not a scalar. */
  | {
      readonly name: string;
      readonly kind: 'rows';
      readonly label: string;
      readonly description?: string;
    };

export interface TagDefinition {
  /** The name as it is written in content: `{% callout %}`. */
  readonly name: string;
  readonly kind: 'wrapper' | 'block' | 'inline';
  /** Shown in the Keystatic insert menu. */
  readonly label: string;
  readonly description: string;
  /** Renderer, relative to the project root. `component()` resolves it. */
  readonly component: string;
  readonly attributes: readonly TagAttribute[];
}

/**
 * Six tags, and the bar for a seventh is high: every tag is a thing an editor
 * has to learn, and a thing the design has to keep honest at every width.
 *
 * `phone`, `hours` and `address` are not conveniences. `site.config.ts` is the
 * single source of truth for the NAP — the Webflow site emitted five phone
 * formats and `verify:jsonld` now fails the build on drift — and body copy is
 * the one place a number could still be typed by hand. These tags mean it
 * cannot be.
 */
export const TAGS = [
  {
    name: 'callout',
    kind: 'wrapper',
    label: 'Callout',
    description: 'A note, a caution or a safety warning, set off from the prose.',
    component: './src/components/markdoc/Callout.astro',
    attributes: [
      {
        name: 'tone',
        kind: 'select',
        label: 'Tone',
        options: [
          { value: 'note', label: 'Note' },
          { value: 'caution', label: 'Caution' },
          { value: 'safety', label: 'Safety' },
        ],
        defaultValue: 'note',
      },
      { name: 'title', kind: 'string', label: 'Title', description: 'Optional heading.' },
    ],
  },
  {
    name: 'specs',
    kind: 'block',
    label: 'Spec table',
    description: 'A hairline column of measured values. Figures set lining tabular.',
    component: './src/components/markdoc/Specs.astro',
    attributes: [
      { name: 'label', kind: 'string', label: 'Rail label', description: 'Optional label on the measurement rail.' },
      { name: 'rows', kind: 'rows', label: 'Rows' },
    ],
  },
  {
    name: 'cta',
    kind: 'block',
    label: 'Call to action',
    description: 'A single action. Use one per page at most.',
    component: './src/components/markdoc/Cta.astro',
    attributes: [
      { name: 'label', kind: 'string', label: 'Label', required: true },
      {
        name: 'href',
        kind: 'string',
        label: 'Destination',
        description: 'A path on this site, a tel: or mailto: link, or a fragment.',
        required: true,
        /*
         * No off-site destinations. A call to action that leaves the site is
         * either a mistake or a decision that belongs in a template, not in
         * body copy — and an unvalidated href is how a content repo starts
         * carrying `javascript:`.
         */
        matches: /^(?:\/[^\s]*|tel:\+?[\d]+|mailto:[^\s@]+@[^\s@]+|#[\w-]+)$/,
      },
    ],
  },
  {
    name: 'phone',
    kind: 'inline',
    label: 'Phone number',
    description: 'The business phone number, from site.config.ts. Never typed by hand.',
    component: './src/components/markdoc/Phone.astro',
    attributes: [],
  },
  {
    name: 'hours',
    kind: 'inline',
    label: 'Opening hours',
    description: 'Opening hours, from site.config.ts.',
    component: './src/components/markdoc/Hours.astro',
    attributes: [],
  },
  {
    name: 'address',
    kind: 'inline',
    label: 'Address',
    description: 'The shop address on one line, from site.config.ts.',
    component: './src/components/markdoc/Address.astro',
    attributes: [],
  },
] as const satisfies readonly TagDefinition[];

export type TagName = (typeof TAGS)[number]['name'];

/**
 * Markdoc *nodes* that render through a component of ours rather than through a
 * bare HTML tag. Same drift problem as the tags above — a component path is a
 * string until a page renders that node — so the list is here and
 * `scripts/verify-content.mjs` checks that each file exists.
 *
 * `document` is the settle on the question Phase 1 left open.
 * `@astrojs/markdoc` renders the root of every entry as `<article>`, which is
 * right for an article and wrong for the other three routed collections: a
 * service page's body is not a self-contained, syndicatable composition, and
 * on `/articles/{slug}` it produced an `<article>` nested inside the
 * `<article>` the template wants to own. The content file cannot know which of
 * those it is; the template always does. So the body renders as prose and the
 * landmark moves to the template.
 */
export const NODE_COMPONENTS = {
  document: './src/components/markdoc/Prose.astro',
  link: './src/components/markdoc/Link.astro',
} as const;

export type NodeComponentName = keyof typeof NODE_COMPONENTS;

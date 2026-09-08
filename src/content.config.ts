import { defineCollection, reference, z } from 'astro:content';
import type { SchemaContext } from 'astro:content';
import { glob } from 'astro/loaders';

import { globArgs, type ContentName } from '~/lib/content-paths.ts';

/**
 * The content model.
 *
 * Two halves that have to agree: this file is what the *build* enforces, and
 * `keystatic.config.ts` is what the *editor* can produce. Zod is the gate —
 * a missing meta description or a testimonial with no attribution fails
 * `astro build`, not review — and `scripts/verify-content.mjs` checks that
 * every path one half writes is a path the other half reads.
 *
 * Two rules shape everything below:
 *
 *   1. **The NAP is not content.** No phone number, address or set of hours
 *      appears in any schema here. `src/site.config.ts` is the single source of
 *      truth, `verify:jsonld` fails the build when rendered markup drifts from
 *      it, and body copy reaches it through the `{% phone %}`, `{% hours %}`
 *      and `{% address %}` Markdoc tags. The Webflow site had five phone
 *      formats because it had five places to type one.
 *   2. **Every entry carries an `seo` object**, with real bounds. A meta
 *      description Google truncates at 160 characters is a defect whether or
 *      not anyone notices, and the crawl found several over 200.
 */

/**
 * Paths come from `src/lib/content-paths.ts`, which `keystatic.config.ts` reads
 * too — so the directory the editor writes to and the directory the build reads
 * cannot come apart.
 */
const from = (name: ContentName) => glob(globArgs(name));

type ImageFn = SchemaContext['image'];

/*
 * Optional means absent. Keystatic omits a field that was left empty rather
 * than writing `''` or `null` — checked by saving an entry through the editor
 * and reading the file back — so `.optional()` is the whole of it, and an empty
 * string in a hand-edited file fails loudly instead of being read as "unset".
 *
 * Dates are coerced because YAML gives a quoted date back as a string and an
 * unquoted one as a Date, and which of the two is on disk is not a decision
 * anybody made.
 */

/**
 * Bounds, not style rules.
 *
 * 70 characters is roughly where a title stops being shown at all; the template
 * appends the brand, so this is the part the writer controls. 165 is the
 * description equivalent. `canonical` exists for the article consolidation in
 * Phase 3: a page that is kept but folded into another points at the survivor
 * rather than competing with it.
 */
const seoSchema = (image: ImageFn) =>
  z.object({
    title: z.string().min(1).max(70),
    description: z.string().min(50).max(165),
    /** Overrides the generated OG image. Phase 4 generates the default. */
    image: image().optional(),
    noindex: z.boolean().default(false),
    canonical: z.string().url().optional(),
  });

/** Fields every routed entry has. */
const routed = (image: ImageFn) =>
  z.object({
    /** The visible H1. Deliberately separate from `seo.title`: on 30 of 30 crawled pages they differed. */
    title: z.string().min(1),
    summary: z.string().min(1).max(240),
    seo: seoSchema(image),
    hero: image().optional(),
    /** Required with `hero`, checked below. Alt text was present on every image the crawl found; parity means keeping it. */
    heroAlt: z.string().min(1).optional(),
    draft: z.boolean().default(false),
  });

/**
 * An image without alt text is the one accessibility regression this migration
 * must not ship: the Webflow build carried alt text on every one of its images,
 * and that is the single thing the audit found it doing right.
 */
const withHeroAlt = <T extends z.ZodObject<z.ZodRawShape>>(schema: T) =>
  schema.refine(
    (value) => {
      const entry = value as { hero?: unknown; heroAlt?: unknown };
      return entry.hero === undefined || Boolean(entry.heroAlt);
    },
    { message: 'heroAlt is required when hero is set', path: ['heroAlt'] },
  );

/**
 * Services and repairs are the same shape — 5 and 9 leaf pages under two
 * parents, both selling one job each. Modelling them as one collection with a
 * `kind` field was the alternative; two collections keep the URL prefix, the
 * index page and the JSON-LD `Service` node decided by which collection an
 * entry is in, rather than by a field that can be set wrong.
 */
const offering = (image: ImageFn, self: 'services' | 'repairs') =>
  withHeroAlt(
    routed(image).extend({
      /** Short form for navigation and cards: "Axle Repair", not "Truck Axle Repair Services in Charlotte, NC". */
      navLabel: z.string().min(1).max(40),
      /** Position in the index and in navigation. Ties break on navLabel. */
      order: z.number().int().min(0).default(0),
      /** Rendered as an FAQPage node in Phase 4, so the answers must be plain text. */
      faqs: z.array(reference('faqs')).default([]),
      /** Internal linking. /service and /repair are orphans on the live site; this is how that stops. */
      related: z.array(reference(self)).default([]),
    }),
  );

const services = defineCollection({
  loader: from('services'),
  schema: ({ image }) => offering(image, 'services'),
});

const repairs = defineCollection({
  loader: from('repairs'),
  schema: ({ image }) => offering(image, 'repairs'),
});

const articles = defineCollection({
  loader: from('articles'),
  schema: ({ image }) =>
    withHeroAlt(
      routed(image).extend({
        publishedAt: z.coerce.date(),
        /** Only when the piece was genuinely revised. A touched date on an untouched article is a lie to a crawler. */
        updatedAt: z.coerce.date().optional(),
        /** Falls back to the business in Phase 4's Article node; the live articles carry no byline. */
        author: z.string().min(1).optional(),
        topics: z.array(z.string().min(1)).default([]),
        /**
         * Phase 3 consolidates the archive. A folded article names its survivor
         * here; the redirect row and `seo.canonical` follow from it, and nothing
         * has to remember which of the two decisions was made first.
         */
        supersededBy: reference('articles').optional(),
      }),
    ),
});

const legal = defineCollection({
  loader: from('legal'),
  schema: ({ image }) =>
    routed(image)
      .omit({ hero: true, heroAlt: true })
      .extend({ effectiveDate: z.coerce.date() }),
});

/**
 * Data collections: no body, because the text has to be reproducible verbatim
 * somewhere other than the page.
 *
 * An FAQ answer becomes an `acceptedAnswer` in JSON-LD and a testimonial
 * becomes a `Review`, and structured data has to match what a reader sees. A
 * Markdoc body would render one string to the page and need a second,
 * flattened one for the graph — two strings that drift. Plain text has one.
 */
const faqs = defineCollection({
  loader: from('faqs'),
  schema: z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    order: z.number().int().min(0).default(0),
  }),
});

const testimonials = defineCollection({
  loader: from('testimonials'),
  schema: z.object({
    quote: z.string().min(1),
    /*
     * The live homepage renders the literal string "Position, Company name"
     * above a reviewer's name. That is why `name` is required and the other two
     * are optional: a template that has to handle a missing role cannot ship a
     * placeholder one.
     */
    name: z.string().min(1),
    role: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    /** Where it was said. A Review node without a source is not one. */
    source: z.enum(['google', 'direct']).default('direct'),
    date: z.coerce.date().optional(),
    order: z.number().int().min(0).default(0),
  }),
});

const accounts = defineCollection({
  loader: from('accounts'),
  schema: ({ image }) =>
    z.object({
      /** The billing network or national account programme, as the fleet customer knows it. */
      name: z.string().min(1),
      logo: image().optional(),
      logoAlt: z.string().min(1).optional(),
      url: z.string().url().optional(),
      note: z.string().max(240).optional(),
      order: z.number().int().min(0).default(0),
    }),
});

/**
 * Singletons.
 *
 * One collection each rather than one `pages` collection with a superset
 * schema: the whole point of a singleton is that its shape is its own. The
 * homepage needs featured entries and a stat rail; a legal page needs neither,
 * and a schema that makes both optional stops describing either.
 *
 * Every one of them is a single file, so `getEntry('home', 'home')` is the
 * access — `src/lib/content.ts` wraps that.
 */
const heroSchema = (image: ImageFn) =>
  z.object({
    /** The rail label above the H1: a section number or a short qualifier. */
    eyebrow: z.string().max(40).optional(),
    heading: z.string().min(1),
    lede: z.string().min(1).max(320),
    image: image().optional(),
    imageAlt: z.string().min(1).optional(),
  });

const pageBase = (image: ImageFn) =>
  z.object({
    title: z.string().min(1),
    lede: z.string().min(1).max(320),
    seo: seoSchema(image),
  });

const home = defineCollection({
  loader: from('home'),
  schema: ({ image }) =>
    z.object({
      seo: seoSchema(image),
      hero: heroSchema(image),
      /** The measurement rail, as content: years in business, bays, turnaround. */
      stats: z
        .array(z.object({ label: z.string().min(1), value: z.string().min(1), note: z.string().min(1).optional() }))
        .max(4)
        .default([]),
      featuredServices: z.array(reference('services')).max(6).default([]),
      featuredRepairs: z.array(reference('repairs')).max(6).default([]),
      testimonials: z.array(reference('testimonials')).max(3).default([]),
      faqs: z.array(reference('faqs')).default([]),
    }),
});

const about = defineCollection({
  loader: from('about'),
  schema: ({ image }) => pageBase(image),
});

/*
 * The three index pages, which are `pageBase` and nothing more: the list they
 * introduce is the collection, not a field. Adding a `featured` array here
 * would be a second place to decide the order of a page that already sorts on
 * `order`.
 */
const servicesIndex = defineCollection({
  loader: from('servicesIndex'),
  schema: ({ image }) => pageBase(image),
});

const repairsIndex = defineCollection({
  loader: from('repairsIndex'),
  schema: ({ image }) => pageBase(image),
});

const articlesIndex = defineCollection({
  loader: from('articlesIndex'),
  schema: ({ image }) => pageBase(image),
});

const contact = defineCollection({
  loader: from('contact'),
  schema: ({ image }) =>
    pageBase(image).extend({
      /** Sits above the form. The form itself is Phase 5. */
      formIntro: z.string().min(1).max(320),
      /** Shown after a successful submission; kept with the copy rather than in the function. */
      formSuccess: z.string().min(1).max(320),
    }),
});

const careers = defineCollection({
  loader: from('careers'),
  schema: ({ image }) =>
    pageBase(image).extend({
      openings: z
        .array(
          z.object({
            role: z.string().min(1),
            employmentType: z.enum(['full-time', 'part-time', 'contract']),
            summary: z.string().min(1).max(320),
          }),
        )
        .default([]),
      /*
       * The same two fields the contact page carries, for the same reason: the
       * copy around a form is copy, and an editor changing what the shop says
       * to an applicant should not be editing the function that emails it.
       */
      formIntro: z.string().min(1).max(320),
      formSuccess: z.string().min(1).max(320),
    }),
});

const fleet = defineCollection({
  loader: from('fleet'),
  schema: ({ image }) =>
    pageBase(image).extend({
      accounts: z.array(reference('accounts')).default([]),
      faqs: z.array(reference('faqs')).default([]),
    }),
});

/**
 * Site settings that are genuinely editorial. Anything that is a fact about the
 * business rather than a choice about the site belongs in `site.config.ts`.
 */
const settings = defineCollection({
  loader: from('settings'),
  schema: ({ image }) =>
    z.object({
      /** The one site-wide action, used by the header and by templates. */
      cta: z.object({ label: z.string().min(1).max(40), href: z.string().min(1) }),
      /* An object field is always written, so this is present and off rather than absent. */
      announcement: z.object({
        enabled: z.boolean().default(false),
        text: z.string().max(160).optional(),
        href: z.string().min(1).optional(),
      }),
      /** Feeds `sameAs` in the JSON-LD graph alongside the Maps listing. */
      social: z
        .array(z.object({ label: z.string().min(1), url: z.string().url() }))
        .default([]),
      defaultSocialImage: image().optional(),
      footerNote: z.string().max(240).optional(),
    }),
});

export const collections = {
  services,
  repairs,
  articles,
  legal,
  faqs,
  testimonials,
  accounts,
  home,
  about,
  servicesIndex,
  repairsIndex,
  articlesIndex,
  contact,
  careers,
  fleet,
  settings,
};

import { collection, config, fields, singleton } from '@keystatic/core';
import { block, inline, wrapper } from '@keystatic/core/content-components';

import { collectionPath, singletonPath } from './src/lib/content-paths.ts';
import { TAGS, type TagAttribute, type TagDefinition } from './src/lib/markdoc-tags.ts';
import { site } from './src/site.config.ts';

/**
 * Keystatic, in local mode.
 *
 * The client confirmed a single editor and no CMS handover for now, and that
 * decision buys a lot: `kind: 'local'` reads and writes the working tree
 * directly, so the admin UI needs no GitHub app, no OAuth callback, no tokens
 * in Vercel and no exception to the deployment protection this project already
 * has switched on. `astro.config.mjs` only registers the integration for
 * `astro dev`, so `/keystatic` and `/api/keystatic` do not exist in a
 * production build at all — the site stays 100% static until the contact
 * function lands in Phase 5, and `verify:static-build` fails if that stops
 * being true.
 *
 * Flipping to GitHub mode later is this object and nothing else:
 *
 *     storage: { kind: 'github', repo: 'wdc/eagle-span' }
 *
 * plus the integration running in the production build. Nothing below depends
 * on the storage kind, which is the property worth protecting: no absolute
 * filesystem paths, no assumption that a save is synchronous, and every path
 * relative to the repository root the way GitHub mode addresses them.
 *
 * The schemas here mirror `src/content.config.ts` field for field. That file is
 * the gate — Zod rejects bad content at build time whatever wrote it — and this
 * one is the editor. Neither writes a path: both derive them from
 * `src/lib/content-paths.ts`, so the directory this config writes to is the
 * directory the build reads by construction rather than by review.
 */

/* -------------------------------------------------------------------------- */
/* Shared field builders                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Assets live under `src/assets` rather than `public`, so Astro's image
 * pipeline can resize them and emit a content hash. `publicPath` is written
 * into the entry relative to the entry file, which is what Astro's `image()`
 * schema resolves against — every entry sits exactly two directories under
 * `src/`, so one prefix is correct for all of them.
 */
const IMAGE_LOCATION = {
  directory: 'src/assets/images',
  publicPath: '../../assets/images/',
};

const CONTENT_IMAGE_LOCATION = {
  directory: 'src/assets/content',
  publicPath: '../../assets/content/',
};

const seoField = () =>
  fields.object(
    {
      title: fields.text({
        label: 'Title tag',
        description: 'Without the business name — the template appends it. Google shows about 60 characters in total.',
        validation: { length: { min: 1, max: 70 } },
      }),
      description: fields.text({
        label: 'Meta description',
        description: 'Between 50 and 165 characters. Longer is truncated in results.',
        multiline: true,
        validation: { length: { min: 50, max: 165 } },
      }),
      image: fields.image({
        label: 'Social image',
        description: 'Overrides the generated one. Leave empty unless this page needs its own.',
        ...IMAGE_LOCATION,
      }),
      noindex: fields.checkbox({
        label: 'Hide from search engines',
        defaultValue: false,
      }),
      canonical: fields.url({
        label: 'Canonical URL',
        description: 'Only when this page is a duplicate of another. Points search engines at the original.',
      }),
    },
    { label: 'SEO' },
  );

/**
 * The body of every page and article.
 *
 * What is switched off matters as much as what is on. No H1 — the page title is
 * the H1 and a second one is a structure error, not a style choice. No code
 * blocks: this is a truck repair site, and a feature nobody needs is a feature
 * that eventually gets misused. Tables stay, because a spec table written as a
 * table is better than one faked with a list.
 */
const contentField = () =>
  fields.markdoc({
    label: 'Content',
    options: {
      heading: [2, 3, 4],
      bold: true,
      italic: true,
      strikethrough: false,
      code: false,
      codeBlock: false,
      blockquote: true,
      orderedList: true,
      unorderedList: true,
      table: true,
      link: true,
      divider: false,
      image: CONTENT_IMAGE_LOCATION,
    },
    components: contentComponents(),
  });

/* -------------------------------------------------------------------------- */
/* Markdoc tags, generated from the manifest                                   */
/* -------------------------------------------------------------------------- */

/**
 * Keystatic content components and Markdoc tag schemas are the same
 * declaration read twice — see `src/lib/markdoc-tags.ts`. Hand-writing both is
 * how an editor ends up able to insert a tag the build rejects.
 */
/**
 * An index page: a title, a lede, an SEO block and an intro body.
 *
 * `at` is the URL it renders at, shown to the editor because it is the one
 * thing about these three pages that is not guessable — `/service` is singular
 * while its children are `/services/*`, and the articles index sits under
 * `/company` while its entries do not. The routing itself is in
 * src/lib/routes.ts.
 */
function indexPage(name: 'servicesIndex' | 'repairsIndex' | 'articlesIndex', label: string, at: string) {
  return singleton({
    label,
    path: singletonPath(name),
    format: { contentField: 'content' },
    entryLayout: 'content',
    schema: {
      title: fields.text({ label: 'Title', description: `The H1 at ${at}.`, validation: { length: { min: 1 } } }),
      lede: fields.text({ label: 'Lede', multiline: true, validation: { length: { min: 1, max: 320 } } }),
      seo: seoField(),
      content: contentField(),
    },
  });
}

function attributeField(attribute: TagAttribute) {
  // `exactOptionalPropertyTypes` is on, so an absent description has to be an
  // absent property rather than an explicit `undefined`.
  const described = attribute.description ? { description: attribute.description } : {};

  switch (attribute.kind) {
    case 'select':
      return fields.select({
        label: attribute.label,
        ...described,
        options: attribute.options.map((option) => ({ label: option.label, value: option.value })),
        defaultValue: attribute.defaultValue,
      });
    case 'boolean':
      return fields.checkbox({ label: attribute.label, ...described, defaultValue: attribute.defaultValue });
    case 'rows':
      return fields.array(
        fields.object({
          label: fields.text({ label: 'Label', validation: { length: { min: 1 } } }),
          value: fields.text({ label: 'Value', validation: { length: { min: 1 } } }),
          note: fields.text({ label: 'Note', description: 'A tolerance, a standard, a condition of measurement.' }),
        }),
        {
          label: attribute.label,
          ...described,
          itemLabel: (props) => props.fields.label.value || 'Row',
          validation: { length: { min: 1 } },
        },
      );
    case 'string':
      return fields.text({
        label: attribute.label,
        ...described,
        ...(attribute.multiline ? { multiline: true } : {}),
        ...(attribute.required ? { validation: { length: { min: 1 } } } : {}),
      });
  }
}

function componentSchema(tag: TagDefinition) {
  return Object.fromEntries(tag.attributes.map((attribute) => [attribute.name, attributeField(attribute)]));
}

function contentComponents() {
  return Object.fromEntries(
    TAGS.map((tag) => {
      const spec = { label: tag.label, description: tag.description, schema: componentSchema(tag) };
      switch (tag.kind) {
        case 'wrapper':
          return [tag.name, wrapper(spec)];
        case 'block':
          return [tag.name, block(spec)];
        case 'inline':
          return [tag.name, inline(spec)];
      }
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Collections                                                                 */
/* -------------------------------------------------------------------------- */

const titleSlug = (description: string) =>
  fields.slug({
    name: { label: 'Title', description: 'The visible heading. Not the title tag.', validation: { length: { min: 1 } } },
    slug: { label: 'URL slug', description },
  });

const summaryField = () =>
  fields.text({
    label: 'Summary',
    description: 'One or two sentences. Used on index pages and in cards.',
    multiline: true,
    validation: { length: { min: 1, max: 240 } },
  });

const heroFields = () => ({
  hero: fields.image({ label: 'Hero image', ...IMAGE_LOCATION }),
  heroAlt: fields.text({
    label: 'Hero alt text',
    description: 'Required whenever there is a hero image. Describe what the photograph shows.',
  }),
});

const draftField = () =>
  fields.checkbox({
    label: 'Draft',
    description: 'Drafts are excluded from the build. Nothing is published by being saved.',
    defaultValue: false,
  });

const orderField = () =>
  fields.integer({
    label: 'Order',
    description: 'Lower comes first.',
    defaultValue: 0,
    validation: { min: 0 },
  });

/** Services and repairs differ only in which collection they relate to. */
const offering = (self: 'services' | 'repairs', label: string, slugDescription: string) =>
  collection({
    label,
    path: collectionPath(self),
    slugField: 'title',
    format: { contentField: 'content' },
    entryLayout: 'content',
    columns: ['title', 'navLabel', 'order'],
    schema: {
      title: titleSlug(slugDescription),
      navLabel: fields.text({
        label: 'Navigation label',
        description: 'The short form: "Axle Repair", not "Truck Axle Repair Services in Charlotte, NC".',
        validation: { length: { min: 1, max: 40 } },
      }),
      summary: summaryField(),
      order: orderField(),
      seo: seoField(),
      ...heroFields(),
      faqs: fields.multiRelationship({
        label: 'FAQs',
        description: 'Shown on the page and emitted as structured data.',
        collection: 'faqs',
      }),
      related: fields.multiRelationship({
        label: 'Related pages',
        description: 'Internal links out of this page. The live site leaves its two index pages orphaned.',
        collection: self,
      }),
      draft: draftField(),
      content: contentField(),
    },
  });

/* -------------------------------------------------------------------------- */

export default config({
  storage: { kind: 'local' },

  ui: {
    brand: { name: site.shortName },
    navigation: {
      Pages: ['home', 'about', 'contact', 'careers', 'fleet'],
      Work: ['servicesIndex', 'services', 'repairsIndex', 'repairs'],
      Writing: ['articlesIndex', 'articles'],
      Proof: ['testimonials', 'faqs', 'accounts'],
      Site: ['settings', 'legal'],
    },
  },

  collections: {
    services: offering('services', 'Services', 'Lives at /services/{slug}. Changing it needs a redirect row.'),
    repairs: offering('repairs', 'Repairs', 'Lives at /repairs/{slug}. Changing it needs a redirect row.'),

    articles: collection({
      label: 'Articles',
      path: collectionPath('articles'),
      slugField: 'title',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['title', 'publishedAt'],
      schema: {
        title: titleSlug('Lives at /articles/{slug}. Changing it needs a redirect row.'),
        summary: summaryField(),
        publishedAt: fields.date({ label: 'Published', validation: { isRequired: true } }),
        updatedAt: fields.date({
          label: 'Updated',
          description: 'Only when the article was genuinely revised. A touched date on untouched text is a lie to a crawler.',
        }),
        author: fields.text({ label: 'Author', description: `Defaults to ${site.name}.` }),
        topics: fields.array(fields.text({ label: 'Topic' }), { label: 'Topics', itemLabel: (props) => props.value }),
        seo: seoField(),
        ...heroFields(),
        supersededBy: fields.relationship({
          label: 'Superseded by',
          description: 'When this article has been folded into another. Phase 3 consolidates the archive.',
          collection: 'articles',
        }),
        draft: draftField(),
        content: contentField(),
      },
    }),

    legal: collection({
      label: 'Legal',
      path: collectionPath('legal'),
      slugField: 'title',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['title', 'effectiveDate'],
      schema: {
        title: titleSlug('Lives at /company/{slug}.'),
        summary: summaryField(),
        effectiveDate: fields.date({ label: 'Effective date', validation: { isRequired: true } }),
        seo: seoField(),
        draft: draftField(),
        content: contentField(),
      },
    }),

    /*
     * The three data collections carry no body. An FAQ answer is repeated
     * verbatim in JSON-LD and a testimonial becomes a Review, and structured
     * data has to match the visible text exactly — a Markdoc body would need a
     * second, flattened copy, and two copies of a sentence drift.
     */
    faqs: collection({
      label: 'FAQs',
      path: collectionPath('faqs'),
      slugField: 'question',
      columns: ['question', 'order'],
      schema: {
        question: fields.slug({
          name: { label: 'Question', validation: { length: { min: 1 } } },
          slug: { label: 'Reference', description: 'How pages refer to this answer.' },
        }),
        answer: fields.text({
          label: 'Answer',
          description: 'Plain text. It is reproduced word for word in structured data, so it cannot carry formatting.',
          multiline: true,
          validation: { length: { min: 1 } },
        }),
        order: orderField(),
      },
    }),

    testimonials: collection({
      label: 'Testimonials',
      path: collectionPath('testimonials'),
      slugField: 'name',
      columns: ['name', 'company', 'order'],
      schema: {
        name: fields.slug({
          name: { label: 'Name', description: 'Who said it. Required.', validation: { length: { min: 1 } } },
          slug: { label: 'Reference' },
        }),
        quote: fields.text({
          label: 'Quote',
          description: 'Their words, verbatim. Reproduced in structured data.',
          multiline: true,
          validation: { length: { min: 1 } },
        }),
        /*
         * Role and company are optional on purpose. The live homepage renders
         * the literal placeholder "Position, Company name" above a reviewer's
         * name; a template that has to handle them being absent cannot ship one.
         */
        role: fields.text({ label: 'Role', description: 'Optional. Leave empty rather than inventing one.' }),
        company: fields.text({ label: 'Company', description: 'Optional.' }),
        rating: fields.integer({ label: 'Rating out of 5', validation: { min: 1, max: 5 } }),
        source: fields.select({
          label: 'Source',
          options: [
            { label: 'Google review', value: 'google' },
            { label: 'Given directly', value: 'direct' },
          ],
          defaultValue: 'direct',
        }),
        date: fields.date({ label: 'Date' }),
        order: orderField(),
      },
    }),

    accounts: collection({
      label: 'Fleet accounts',
      path: collectionPath('accounts'),
      slugField: 'name',
      columns: ['name', 'order'],
      schema: {
        name: fields.slug({
          name: { label: 'Account or network', validation: { length: { min: 1 } } },
          slug: { label: 'Reference' },
        }),
        logo: fields.image({ label: 'Logo', ...IMAGE_LOCATION }),
        logoAlt: fields.text({ label: 'Logo alt text', description: 'Required whenever there is a logo.' }),
        url: fields.url({ label: 'Website' }),
        note: fields.text({ label: 'Note', multiline: true, validation: { length: { max: 240 } } }),
        order: orderField(),
      },
    }),
  },

  singletons: {
    home: singleton({
      label: 'Home',
      path: singletonPath('home'),
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        seo: seoField(),
        hero: fields.object(
          {
            eyebrow: fields.text({ label: 'Rail label', description: 'The micro label above the heading.' }),
            heading: fields.text({ label: 'Heading', validation: { length: { min: 1 } } }),
            lede: fields.text({ label: 'Lede', multiline: true, validation: { length: { min: 1, max: 320 } } }),
            image: fields.image({
              label: 'Hero image',
              description:
                'Optional, and it replaces the thrust-angle diagram rather than sitting under it. ' +
                'Leave it empty to keep the animated diagram as the hero.',
              ...IMAGE_LOCATION,
            }),
            imageAlt: fields.text({
              label: 'Hero alt text',
              description: 'Required whenever there is a hero image.',
            }),
          },
          { label: 'Hero' },
        ),
        stats: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', validation: { length: { min: 1 } } }),
            value: fields.text({ label: 'Value', validation: { length: { min: 1 } } }),
            note: fields.text({ label: 'Note' }),
          }),
          { label: 'Stat rail', description: 'Up to four.', itemLabel: (props) => props.fields.label.value || 'Stat' },
        ),
        featuredServices: fields.multiRelationship({ label: 'Featured services', collection: 'services' }),
        featuredRepairs: fields.multiRelationship({ label: 'Featured repairs', collection: 'repairs' }),
        testimonials: fields.multiRelationship({ label: 'Testimonials', collection: 'testimonials' }),
        faqs: fields.multiRelationship({ label: 'FAQs', collection: 'faqs' }),
        content: contentField(),
      },
    }),

    /*
     * The index pages. Each introduces the collection listed under it, so the
     * only fields are the ones every page has — the list itself is the
     * collection in the order its entries declare.
     */
    servicesIndex: indexPage('servicesIndex', 'Services index', '/service'),
    repairsIndex: indexPage('repairsIndex', 'Repairs index', '/repair'),
    articlesIndex: indexPage('articlesIndex', 'Articles index', '/company/articles'),

    about: singleton({
      label: 'About',
      path: singletonPath('about'),
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title', validation: { length: { min: 1 } } }),
        lede: fields.text({ label: 'Lede', multiline: true, validation: { length: { min: 1, max: 320 } } }),
        seo: seoField(),
        content: contentField(),
      },
    }),

    contact: singleton({
      label: 'Contact',
      path: singletonPath('contact'),
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title', validation: { length: { min: 1 } } }),
        lede: fields.text({ label: 'Lede', multiline: true, validation: { length: { min: 1, max: 320 } } }),
        /*
         * The phone number, address and hours are deliberately absent. They come
         * from src/site.config.ts, which verify:jsonld gates against the Google
         * Business Profile — and body copy can reach them with {% phone %},
         * {% hours %} and {% address %}.
         */
        formIntro: fields.text({
          label: 'Above the form',
          multiline: true,
          validation: { length: { min: 1, max: 320 } },
        }),
        formSuccess: fields.text({
          label: 'After sending',
          description: 'Shown once the form has been submitted. Phase 5 wires the form itself.',
          multiline: true,
          validation: { length: { min: 1, max: 320 } },
        }),
        seo: seoField(),
        content: contentField(),
      },
    }),

    careers: singleton({
      label: 'Careers',
      path: singletonPath('careers'),
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title', validation: { length: { min: 1 } } }),
        lede: fields.text({ label: 'Lede', multiline: true, validation: { length: { min: 1, max: 320 } } }),
        openings: fields.array(
          fields.object({
            role: fields.text({ label: 'Role', validation: { length: { min: 1 } } }),
            employmentType: fields.select({
              label: 'Type',
              options: [
                { label: 'Full time', value: 'full-time' },
                { label: 'Part time', value: 'part-time' },
                { label: 'Contract', value: 'contract' },
              ],
              defaultValue: 'full-time',
            }),
            summary: fields.text({ label: 'Summary', multiline: true, validation: { length: { min: 1, max: 320 } } }),
          }),
          { label: 'Open roles', itemLabel: (props) => props.fields.role.value || 'Role' },
        ),
        formIntro: fields.text({
          label: 'Above the application form',
          multiline: true,
          validation: { length: { min: 1, max: 320 } },
        }),
        formSuccess: fields.text({
          label: 'After sending',
          description: 'Shown once an application has been submitted.',
          multiline: true,
          validation: { length: { min: 1, max: 320 } },
        }),
        seo: seoField(),
        content: contentField(),
      },
    }),

    fleet: singleton({
      label: 'Fleet',
      path: singletonPath('fleet'),
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title', validation: { length: { min: 1 } } }),
        lede: fields.text({ label: 'Lede', multiline: true, validation: { length: { min: 1, max: 320 } } }),
        accounts: fields.multiRelationship({ label: 'Accounts honoured', collection: 'accounts' }),
        faqs: fields.multiRelationship({ label: 'FAQs', collection: 'faqs' }),
        seo: seoField(),
        content: contentField(),
      },
    }),

    /*
     * Settings holds choices about the site. Facts about the business — the
     * name, the phone number, the address, the hours, the map listing — are in
     * src/site.config.ts and are not editable here, because there they have a
     * CI gate and here they would have an editor.
     */
    settings: singleton({
      label: 'Settings',
      path: singletonPath('settings'),
      schema: {
        cta: fields.object(
          {
            label: fields.text({ label: 'Label', validation: { length: { min: 1, max: 40 } } }),
            href: fields.text({ label: 'Destination', validation: { length: { min: 1 } } }),
          },
          { label: 'Site call to action' },
        ),
        announcement: fields.object(
          {
            enabled: fields.checkbox({ label: 'Show it', defaultValue: false }),
            text: fields.text({ label: 'Text', validation: { length: { max: 160 } } }),
            href: fields.text({ label: 'Link' }),
          },
          { label: 'Announcement' },
        ),
        social: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', validation: { length: { min: 1 } } }),
            url: fields.url({ label: 'URL', validation: { isRequired: true } }),
          }),
          {
            label: 'Social profiles',
            description: 'Emitted as sameAs in the JSON-LD graph, alongside the Google listing.',
            itemLabel: (props) => props.fields.label.value || 'Profile',
          },
        ),
        defaultSocialImage: fields.image({ label: 'Default social image', ...IMAGE_LOCATION }),
        footerNote: fields.text({ label: 'Footer note', multiline: true, validation: { length: { max: 240 } } }),
      },
    }),
  },
});

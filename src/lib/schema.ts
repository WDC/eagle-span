import { site } from '~/site.config.ts';

/**
 * The site-wide JSON-LD graph.
 *
 * `AutoRepair`, not a generic `Organization` — the specific type is what makes
 * the opening hours, service catalogue and area served legible to Google as a
 * local business rather than as decoration. Every node is @id-addressable so
 * page-level nodes can reference the business instead of restating it.
 *
 * The crawl found structured data on exactly two kinds of page: the homepage
 * (`AutoRepair`) and the seven articles (`BlogPosting`). All 14 service and
 * repair pages carried none — Phase 0 defect 8 — which is the gap the `Service`
 * node below closes, with `scripts/verify-jsonld.mjs` as the gate that keeps it
 * closed.
 *
 * One rule runs through the whole file: **a node describes something the reader
 * can see on the page it is on.** A `FAQPage` whose answers are not rendered, a
 * `BreadcrumbList` with no visible trail and an `Offer` for a page that does not
 * exist are all the same defect, and each of them is checked rather than
 * trusted.
 */

const ORG_ID = `${site.url}/#business`;
const SITE_ID = `${site.url}/#website`;

/** The @id of the `Service` node for a routed offering, on its own page. */
export const serviceId = (path: string) => `${site.url}${path}#service`;

/** One entry in `hasOfferCatalog`: enough to identify the service, no more. */
export interface Offering {
  /** `/services/{slug}` or `/repairs/{slug}`. */
  path: string;
  /** The short navigation label, not the keyword-loaded H1. */
  name: string;
}

export interface BusinessOptions {
  /**
   * Every published service and repair. Rendered as `hasOfferCatalog`, which is
   * how the shop's whole service list stays legible from any page rather than
   * only from the two index pages nothing links to.
   */
  offerings?: readonly Offering[];
  /** Profiles from `settings.social`, joined with the Maps listing. */
  sameAs?: readonly string[];
}

export function businessNode({ offerings = [], sameAs = [] }: BusinessOptions = {}) {
  return {
    '@type': 'AutoRepair',
    '@id': ORG_ID,
    name: site.name,
    url: `${site.url}/`,
    telephone: site.phoneDisplay,
    priceRange: '$-$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: site.geo.latitude,
      longitude: site.geo.longitude,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [...site.hours.dayOfWeek],
        opens: site.hours.opens,
        closes: site.hours.closes,
      },
    ],
    areaServed: { '@type': 'City', name: 'Charlotte', containedInPlace: { '@type': 'State', name: 'North Carolina' } },
    /*
     * The offer's `itemOffered` is inlined rather than left as a bare `@id`
     * reference. The full `Service` node lives on the service's own page; a
     * reference to it from every other page in the site would point at a node
     * that is not in that page's graph, which a consumer is entitled to ignore.
     * Name and URL make each offer self-describing wherever it appears.
     */
    ...(offerings.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: `Services and repairs — ${site.name}`,
            itemListElement: offerings.map((offering) => ({
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                '@id': serviceId(offering.path),
                name: offering.name,
                url: `${site.url}${offering.path}`,
              },
            })),
          },
        }
      : {}),
    /*
     * The Maps listing is always in `sameAs` — it is the profile the NAP is
     * being kept byte-identical to, and the one the live footer got wrong by
     * linking a shop in Springfield, MO.
     */
    sameAs: [site.mapsUrl, ...sameAs],
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: `${site.url}/`,
    name: site.name,
    publisher: { '@id': ORG_ID },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

/**
 * Breadcrumbs must match what is visible on the page — a BreadcrumbList that
 * describes a trail the user cannot see is a structured-data violation.
 *
 * `src/components/Breadcrumbs.astro` renders from the same array the template
 * passes here, and `verify:jsonld` checks every `name` in the list appears in
 * the page's rendered text. The two cannot come apart quietly.
 */
export function breadcrumbNode(crumbs: readonly Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${site.url}${c.path}`,
    })),
  };
}

/**
 * The page itself.
 *
 * `type` narrows `WebPage` where a more specific subtype is true: an index is a
 * `CollectionPage`, the contact page is a `ContactPage`, an article page is an
 * `ItemPage` carrying the `Article`. Nothing downstream depends on the
 * narrowing, but a graph that says "this is a list of things" when it is one
 * costs nothing and is the difference between describing the page and
 * describing the template.
 */
export type WebPageType = 'WebPage' | 'CollectionPage' | 'ContactPage' | 'ItemPage' | 'AboutPage';

export function webPageNode(path: string, title: string, description: string, type: WebPageType = 'WebPage') {
  return {
    '@type': type,
    '@id': `${site.url}${path}#page`,
    url: `${site.url}${path}`,
    name: title,
    description,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': ORG_ID },
  };
}

/**
 * One service or repair.
 *
 * `provider` is a reference rather than a copy: the `AutoRepair` node is in the
 * same graph on every page, so restating the address here would be a second
 * place for the NAP to drift.
 *
 * `serviceType` is the short navigation label. The H1 on these pages is written
 * for search ("Truck Wheel Alignment in Charlotte, NC") and is already `name`;
 * repeating the city inside `serviceType` describes the copy rather than the
 * work.
 */
export function serviceNode(options: {
  path: string;
  name: string;
  serviceType: string;
  description: string;
}) {
  return {
    '@type': 'Service',
    '@id': serviceId(options.path),
    name: options.name,
    serviceType: options.serviceType,
    description: options.description,
    url: `${site.url}${options.path}`,
    provider: { '@id': ORG_ID },
    areaServed: { '@type': 'City', name: 'Charlotte', containedInPlace: { '@type': 'State', name: 'North Carolina' } },
    isPartOf: { '@id': `${site.url}${options.path}#page` },
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * `FAQPage`, from the `faqs` collection.
 *
 * The answers are plain text in the content model precisely so this node and
 * the rendered page can share one string — see the note on data collections in
 * `src/content.config.ts`. An `acceptedAnswer` the reader cannot find on the
 * page is the structured-data violation Google actions manually.
 */
export function faqPageNode(path: string, items: readonly FaqItem[]) {
  return {
    '@type': 'FAQPage',
    '@id': `${site.url}${path}#faq`,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/**
 * `Article`, replacing the `BlogPosting` the Webflow site emitted.
 *
 * `dateModified` falls back to `datePublished` rather than to the build date.
 * A modification date that moves every time the site is deployed tells a
 * crawler the archive is rewritten weekly, which is both untrue and the exact
 * signal that gets a site's freshness discounted — the same reason the sitemap
 * takes its `lastmod` from content and git rather than from `Date.now()`.
 */
export function articleNode(options: {
  path: string;
  headline: string;
  description: string;
  publishedAt: Date;
  updatedAt?: Date | undefined;
  author?: string | undefined;
  image?: string | undefined;
}) {
  return {
    '@type': 'Article',
    '@id': `${site.url}${options.path}#article`,
    headline: options.headline,
    description: options.description,
    datePublished: options.publishedAt.toISOString(),
    dateModified: (options.updatedAt ?? options.publishedAt).toISOString(),
    /* The live articles carry no byline, so the business is the author until one is written. */
    author: options.author ? { '@type': 'Person', name: options.author } : { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    ...(options.image ? { image: options.image } : {}),
    mainEntityOfPage: { '@id': `${site.url}${options.path}#page` },
  };
}

/** Wraps nodes into a single @graph — one script tag per page, never several. */
export function graph(nodes: readonly object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

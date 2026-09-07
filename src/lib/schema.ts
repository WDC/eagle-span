import { site } from '~/site.config.ts';

/**
 * The site-wide JSON-LD graph.
 *
 * `AutoRepair`, not a generic `Organization` — the specific type is what makes
 * the opening hours, service catalogue and area served legible to Google as a
 * local business rather than as decoration. Every node is @id-addressable so
 * page-level nodes can reference the business instead of restating it.
 */

const ORG_ID = `${site.url}/#business`;
const SITE_ID = `${site.url}/#website`;

export function businessNode() {
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
    sameAs: [site.mapsUrl],
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

export function webPageNode(path: string, title: string, description: string) {
  return {
    '@type': 'WebPage',
    '@id': `${site.url}${path}#page`,
    url: `${site.url}${path}`,
    name: title,
    description,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': ORG_ID },
  };
}

/** Wraps nodes into a single @graph — one script tag per page, never several. */
export function graph(nodes: readonly object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

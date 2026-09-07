import type { RoutedName } from './content.ts';
import type { Crumb } from './schema.ts';

/**
 * Where a page lives on the web — declared once, read by the templates, the
 * navigation, the breadcrumbs, the sitemap and the OG endpoint.
 *
 * This is the URL-space twin of `src/lib/content-paths.ts`. That file is the
 * only thing that knows where an entry lives *on disk*; this one is the only
 * thing that knows where it lives *at a URL*, and for the same reason: a path
 * written out in nine templates is a path that will eventually be written out
 * eight ways.
 *
 * Every path here is reproduced 1:1 from the Phase 0 crawl. The plurals are
 * genuinely inconsistent — children at `/services/{slug}` under an index at
 * `/service` — and that inconsistency is the live site's. Moving 14 URLs to
 * tidy it up buys nothing and spends real ranking; `data/redirects.csv`
 * catches the plural guesses instead.
 */

export interface Section {
  /** URL prefix for the collection's entries. */
  readonly base: string;
  /**
   * The index page listing them, when one exists. It is also the parent crumb
   * — a breadcrumb only names an ancestor the reader can actually open.
   */
  readonly index: string | null;
  /** Short label, for navigation and for the crumb. */
  readonly label: string;
}

export const SECTIONS = {
  /* `/service` singular is the live index; all five children are `/services/*`. */
  services: { base: '/services', index: '/service', label: 'Services' },
  /* Same shape, nine children. */
  repairs: { base: '/repairs', index: '/repair', label: 'Repairs' },
  /*
   * The one place the crawl corrected the task's assumption: the index sits at
   * `/company/articles` but the entries are NOT nested under it.
   */
  articles: { base: '/articles', index: '/company/articles', label: 'Articles' },
  /*
   * Legal pages sit directly under `/company` and there is no `/company` page
   * to point a crumb at — the live site 404s it, and the redirect map sends it
   * to `/company/about`, which is a destination rather than a parent.
   */
  legal: { base: '/company', index: null, label: 'Company' },
} as const satisfies Record<RoutedName, Section>;

/** The URL of one entry in a routed collection. */
export function entryPath(collection: RoutedName, id: string): string {
  return `${SECTIONS[collection].base}/${id}`;
}

/**
 * Standalone pages: everything that is a singleton rather than a collection
 * entry. `fleet` is the only new URL in the whole migration.
 */
export const PAGES = {
  home: '/',
  contact: '/contact',
  about: '/company/about',
  careers: '/company/careers',
  fleet: '/fleet',
} as const;

/**
 * The primary navigation, in order.
 *
 * `/service` and `/repair` are here because of Phase 0 defect 10: both are in
 * the sitemap and neither is linked from any of the 30 crawled pages. Every
 * page linked its 14 children directly and skipped the two indexes, so the
 * indexes accumulated no internal link equity at all. A header link on every
 * page is the fix, and it is why the navigation is not derived from the
 * collections — the indexes are the point.
 */
export const NAV = [
  { label: SECTIONS.services.label, href: SECTIONS.services.index! },
  { label: SECTIONS.repairs.label, href: SECTIONS.repairs.index! },
  { label: 'Fleet', href: PAGES.fleet },
  { label: 'About', href: PAGES.about },
  { label: 'Contact', href: PAGES.contact },
] as const;

/**
 * The open-graph image for a page, which is a build artefact rather than a
 * route — `src/pages/og/[...slug].png.ts` renders one per page and this is the
 * only place the naming is decided.
 */
export function ogPath(path: string): string {
  return `/og${path === '/' ? '/index' : path}.png`;
}

/** Every trail starts here, and the homepage itself never shows one. */
export const HOME_CRUMB: Crumb = { name: 'Home', path: PAGES.home };

/**
 * The trail for a page, built to one rule: **a crumb only names an ancestor the
 * reader can actually open.**
 *
 * That is why legal pages come out two deep. They sit under `/company`, but
 * `/company` is not a page — the live site 404s it and the redirect map sends
 * it to `/company/about`, which is a sibling rather than a parent. A crumb
 * pointing there would describe a hierarchy that does not exist, and a
 * BreadcrumbList is supposed to describe the one that does.
 */
export function crumbsFor(collection: RoutedName, name: string, path: string): Crumb[] {
  const section = SECTIONS[collection];
  return [
    HOME_CRUMB,
    ...(section.index ? [{ name: section.label, path: section.index }] : []),
    { name, path },
  ];
}

/** A standalone page: home, then itself. */
export function pageCrumbs(name: string, path: string): Crumb[] {
  return [HOME_CRUMB, { name, path }];
}

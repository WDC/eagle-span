import type { CollectionEntry } from 'astro:content';

import { listArticles, listOfferings } from './content.ts';
import { PAGES, SECTIONS, entryPath } from './routes.ts';

/**
 * The navigation tree, built from the content rather than written out.
 *
 * `routes.ts` has held a flat `NAV` of five links since Phase 4, and the reason
 * it was flat is written in its own comment: "fourteen links in a header is a
 * menu nobody reads and a link graph with no shape". That is true of fourteen
 * links laid end to end in a bar. It is not true of fourteen links in two
 * panels, grouped under the index they belong to, each with the sentence that
 * says what it is — which is what the live site has and what a reader looking
 * for "the one about my brakes" actually needs.
 *
 * So the header changes shape and keeps the fix. Phase 0 defect 10 was that
 * `/service` and `/repair` were in the sitemap and linked from nowhere; here
 * each panel is *headed* by its index, as a link, on every page. The indexes
 * gain the equity they were missing and the children stop being reachable only
 * by going through them.
 *
 * Built at build time from the collections, so a fifteenth repair appears in
 * the menu by existing. There is no second list to keep in step, which is the
 * same reason `SECTIONS` and `PAGES` exist at all.
 */

/** One link inside a panel. */
export interface NavChild {
  readonly href: string;
  readonly label: string;
  /** The one-line summary under the label. Trimmed for the panel, not the page. */
  readonly summary: string;
  /** Icon key — an entry id for an offering, a page name otherwise. */
  readonly icon: string;
}

/** A column of links inside a panel. Most panels have one. */
export interface NavGroup {
  readonly label: string;
  readonly children: readonly NavChild[];
}

export interface NavItem {
  readonly label: string;
  readonly href: string;
  /** Absent on a plain link — Fleet and Contact have no panel. */
  readonly panel?: {
    /** Sits at the top of the panel, over the columns. */
    readonly lede: string;
    readonly groups: readonly NavGroup[];
    /** The link back to the section index, worded for the panel. */
    readonly indexLabel: string;
  };
}

/**
 * A panel summary is not a page summary. The page's runs to 240 characters and
 * earns them; in a menu it wraps to four lines and turns a scannable column
 * into a wall. One clause, cut at the first sentence end or at 74 characters —
 * which is two lines in a panel card, and two lines is what the grid has room
 * for without the rows below it going out of alignment.
 */
export function trimSummary(summary: string, limit = 74): string {
  const firstSentence = summary.match(/^[^.]{20,}?\./)?.[0];
  const text = firstSentence && firstSentence.length <= limit ? firstSentence : summary;
  if (text.length <= limit) return text.replace(/\.$/, '');
  /* Cut on a word, never mid-word, and use a real ellipsis. */
  return `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`;
}

export async function buildNav(): Promise<readonly NavItem[]> {
  const [services, repairs, articles] = await Promise.all([
    listOfferings('services'),
    listOfferings('repairs'),
    listArticles(),
  ]);

  const offeringChildren = <C extends 'services' | 'repairs'>(
    collection: C,
    entries: readonly CollectionEntry<C>[],
  ): NavChild[] =>
    entries.map((entry) => ({
      href: entryPath(collection, entry.id),
      label: entry.data.navLabel,
      summary: trimSummary(entry.data.summary),
      icon: entry.id,
    }));

  return [
    {
      label: SECTIONS.services.label,
      href: SECTIONS.services.index!,
      panel: {
        lede: 'Scheduled work — the jobs that keep a truck out of the bay.',
        indexLabel: 'All services',
        groups: [{ label: SECTIONS.services.label, children: offeringChildren('services', services) }],
      },
    },
    {
      label: SECTIONS.repairs.label,
      href: SECTIONS.repairs.index!,
      panel: {
        lede: 'Something has failed. These are the nine we fix most.',
        indexLabel: 'All repairs',
        groups: [{ label: SECTIONS.repairs.label, children: offeringChildren('repairs', repairs) }],
      },
    },
    { label: 'Fleet', href: PAGES.fleet },
    {
      label: 'Company',
      href: PAGES.about,
      panel: {
        lede: 'A Charlotte shop since 1998, and the people in it.',
        indexLabel: 'About Eagle Span',
        groups: [
          {
            label: 'Company',
            children: [
              {
                href: PAGES.about,
                label: 'About',
                summary: 'The shop, the equipment and how the work is run',
                icon: 'about',
              },
              {
                href: SECTIONS.articles.index!,
                label: 'Articles',
                /*
                 * The count is the point of the link. An archive of seven is
                 * worth opening; "Articles" on its own could be empty.
                 */
                summary: `${articles.length} pieces on keeping heavy-duty trucks running`,
                icon: 'articles',
              },
              {
                href: PAGES.careers,
                label: 'Careers',
                summary: 'Open roles for diesel technicians in Charlotte',
                icon: 'careers',
              },
              {
                /*
                 * The live site's own destination for this: an anchor on the
                 * homepage, not a page. Reproduced rather than invented —
                 * `/fleet` is the one new URL in this migration and a
                 * testimonials page would be the second.
                 */
                href: `${PAGES.home}#testimonials`,
                label: 'Testimonials',
                summary: 'What fleet managers and owner-operators say',
                icon: 'testimonials',
              },
            ],
          },
        ],
      },
    },
    { label: 'Contact', href: PAGES.contact },
  ];
}

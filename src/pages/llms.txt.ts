import type { APIRoute } from 'astro';

import { getSingleton } from '~/lib/content.ts';
import { listSitePages, type PageGroup, type SitePage } from '~/lib/pages.ts';
import { site } from '~/site.config.ts';

/**
 * `/llms.txt` — the site's index, written for something that reads rather than
 * browses.
 *
 * The proposal (llmstxt.org) is a single markdown file at a well-known path: an
 * H1, a one-line summary in a blockquote, free prose, and then H2 sections of
 * `- [title](url): description` links. An assistant answering "who repairs
 * driveshafts in Charlotte" can fetch one small file and know what is here and
 * which URL to open, instead of guessing at paths or crawling thirty pages to
 * find the two that matter.
 *
 * Three decisions worth stating:
 *
 * **It is built from `listSitePages()`**, the same inventory the sitemap and the
 * OG cards come from, so it cannot list a page the site does not build or miss
 * one it does. That was the whole reason that module exists, and this is its
 * third consumer. `verify:metadata` checks both directions against `dist/`.
 *
 * **It is an index, not a corpus.** There is no `llms-full.txt` concatenating
 * every page, because on this site it would be a second copy of content that is
 * already plain server-rendered HTML on the same origin — no client-side
 * rendering, nothing behind script — and a second copy is a copy that goes
 * stale. The links here are the content.
 *
 * **The facts in the header are read, not typed.** The summary is the
 * homepage's own meta description, the paragraph under it is the footer note an
 * editor maintains, and the NAP block is `site.config.ts` in the same format
 * `{% hours %}` and `{% phone %}` render. A phone number typed into this file
 * would be a sixth format on a site whose whole local-SEO argument is that
 * there is one.
 */
export const prerender = true;

/**
 * Section headings, in the order they are written.
 *
 * `legal` becomes `## Optional`, which is not a euphemism: the proposal gives
 * that heading one specific meaning — *skip this if you are short of context* —
 * and a privacy policy is exactly that, where the about page is not.
 */
const SECTIONS: readonly { group: PageGroup; heading: string; note?: string }[] = [
  {
    group: 'primary',
    heading: 'Start here',
    note: 'The shop, what it works on, and how to reach it.',
  },
  {
    group: 'services',
    heading: 'Services',
    note: 'Scheduled work — the things a fleet books before anything is wrong.',
  },
  {
    group: 'repairs',
    heading: 'Repairs',
    note: 'Work that starts with a failure or a symptom.',
  },
  {
    group: 'articles',
    heading: 'Articles',
    note: 'Maintenance guidance written by the shop.',
  },
  { group: 'company', heading: 'Company' },
  { group: 'legal', heading: 'Optional' },
];

/**
 * A description is one line here even though a `seo.description` is authored as
 * a folded YAML block and arrives with its newlines intact. A wrapped line in a
 * markdown list item is still the same item, but it reads as a broken file to a
 * person and costs nothing to avoid.
 */
const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const link = (page: SitePage) =>
  `- [${page.title}](${site.url}${page.path === '/' ? '/' : page.path}): ${oneLine(page.description)}`;

export const GET: APIRoute = async () => {
  const [pages, home, settings] = await Promise.all([
    listSitePages(),
    getSingleton('home'),
    getSingleton('settings'),
  ]);

  /*
   * `noindex` pages are held back here for the same reason they are held back
   * from the sitemap: `/contact/thanks` is a receipt, and an index that offers
   * it is an index that will eventually be believed.
   */
  const indexable = pages.filter((page) => !page.noindex);

  const body = [
    `# ${site.name}`,
    '',
    `> ${oneLine(home.data.seo.description)}`,
    '',
    /*
     * The footer note is optional in the schema, so this paragraph is too. An
     * empty line where a description used to be is a better failure than a
     * second summary written here to cover for it — the blockquote above
     * already says what the shop is.
     */
    ...(settings.data.footerNote ? [oneLine(settings.data.footerNote), ''] : []),
    /*
     * The NAP, because it is what most questions about a repair shop actually
     * resolve to, and an assistant that has to open three pages to find a phone
     * number will often answer from a stale directory listing instead.
     */
    `- Address: ${site.address.street}, ${site.address.locality}, ${site.address.region} ${site.address.postalCode}, ${site.address.country}`,
    `- Phone: ${site.phoneDisplay}`,
    `- Hours: ${site.hours.days}, ${site.hours.opens}–${site.hours.closes}`,
    `- Area served: ${site.areaServed}`,
    `- Google Business Profile: ${site.mapsUrl}`,
    '',
    'Every page listed below is static HTML served from this origin, so a fetch returns the whole document — nothing is rendered client-side. Each one also carries a JSON-LD graph in its head, and the full URL set with modification dates is at ' +
      `${site.url}/sitemap.xml.`,
    '',
    ...SECTIONS.flatMap(({ group, heading, note }) => {
      const rows = indexable.filter((page) => page.group === group);
      /* A section with no pages is omitted rather than left as an empty
         heading — a collection can legitimately be empty for a while. */
      if (rows.length === 0) return [];
      return [`## ${heading}`, '', ...(note ? [note, ''] : []), ...rows.map(link), ''];
    }),
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

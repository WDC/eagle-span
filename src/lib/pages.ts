import type { CollectionEntry } from 'astro:content';

import { getSingleton, listArticles, listOfferings, listPublished } from './content.ts';
import { PAGES, SECTIONS, entryPath } from './routes.ts';
import { site } from '~/site.config.ts';

/**
 * Every page this site builds, as data.
 *
 * Three things need this list and none of them is a template: the sitemap needs
 * a `lastmod` per URL, `src/pages/og/[...slug].png.ts` needs to render one image
 * per page, and `src/pages/llms.txt.ts` needs to name every page an agent should
 * read. All three were going to end up re-deriving "what pages exist" from the
 * collections, and a second copy of that derivation is a second place for a
 * page to be missed.
 *
 * It is deliberately *not* what the templates route from. A template already
 * has the entry in hand and needs its body, its FAQs and its related entries;
 * routing it through a flattened summary would lose all of that. This is the
 * projection the build artefacts need, and nothing more.
 */
export interface SitePage {
  /** Path without origin. `/` for the homepage. */
  path: string;
  /** `seo.title`, without the brand suffix — the OG image sets it as the headline. */
  title: string;
  /** The rail label on the OG image: which part of the site this is. */
  eyebrow: string;
  description: string;
  /** Held back from the index, and therefore from the sitemap. */
  noindex: boolean;
  /** Which part of the site this is. `src/pages/llms.txt.ts` groups by it. */
  group: PageGroup;
  /**
   * The entry's file, relative to the repository root. `src/lib/lastmod.ts`
   * asks git when it was last changed, for the pages whose schema carries no
   * date of its own.
   */
  source?: string | undefined;
  /**
   * A date the content itself asserts — an article's revision or publication,
   * a policy's effective date. Authoritative over git: an editor saying when a
   * policy took effect outranks the commit that reflowed its frontmatter.
   */
  contentDate?: Date | undefined;
}

/**
 * Which part of the site a page belongs to, for the consumer that presents the
 * inventory as a grouped list rather than as a flat one.
 *
 * It is set here, where the collection each page came from is still known,
 * rather than inferred downstream from a path: `/company/about` and
 * `/company/privacy-policy` share a prefix and are not the same kind of thing,
 * and a consumer that guessed would have to be corrected every time one of them
 * moved. `legal` is separate from `company` for exactly that reason — llms.txt
 * files it under the spec's `## Optional`, the heading that says *skip this if
 * you are short of context*, which is true of a privacy policy and false of the
 * about page.
 */
export type PageGroup = 'primary' | 'services' | 'repairs' | 'articles' | 'company' | 'legal';

/**
 * `filePath` comes off the glob loader relative to the project root already,
 * but an absolute path would silently produce a git query that matches nothing
 * — and `git log` on a path outside the repo exits 0 with no output, which
 * looks exactly like a file with no history. Normalising here means
 * `src/lib/lastmod.ts` can treat "no output" as one case.
 */
function sourceOf(entry: { filePath?: string }): string | undefined {
  const filePath = entry.filePath;
  if (!filePath) return undefined;
  return filePath.replace(/^\.\//, '');
}

type Routed = CollectionEntry<'services' | 'repairs' | 'articles' | 'legal'>;

const fromEntry = (
  entry: Routed,
  path: string,
  eyebrow: string,
  group: PageGroup,
  contentDate?: Date,
): SitePage => ({
  path,
  title: entry.data.seo.title,
  eyebrow,
  description: entry.data.seo.description,
  noindex: entry.data.seo.noindex,
  group,
  source: sourceOf(entry),
  contentDate,
});

export async function listSitePages(): Promise<SitePage[]> {
  const [home, about, careers, contact, fleet, servicesIndex, repairsIndex, articlesIndex] = await Promise.all([
    getSingleton('home'),
    getSingleton('about'),
    getSingleton('careers'),
    getSingleton('contact'),
    getSingleton('fleet'),
    getSingleton('servicesIndex'),
    getSingleton('repairsIndex'),
    getSingleton('articlesIndex'),
  ]);

  const [services, repairs, articles, legal] = await Promise.all([
    listOfferings('services'),
    listOfferings('repairs'),
    listArticles(),
    listPublished('legal'),
  ]);

  const singleton = (
    entry: { data: { seo: { title: string; description: string; noindex: boolean } }; filePath?: string },
    path: string,
    eyebrow: string,
    group: PageGroup,
  ): SitePage => ({
    path,
    title: entry.data.seo.title,
    eyebrow,
    description: entry.data.seo.description,
    noindex: entry.data.seo.noindex,
    group,
    source: sourceOf(entry),
  });

  return [
    singleton(home, PAGES.home, `${site.address.locality}, ${site.address.region}`, 'primary'),
    singleton(servicesIndex, SECTIONS.services.index!, SECTIONS.services.label, 'services'),
    singleton(repairsIndex, SECTIONS.repairs.index!, SECTIONS.repairs.label, 'repairs'),
    singleton(articlesIndex, SECTIONS.articles.index!, SECTIONS.articles.label, 'articles'),
    singleton(about, PAGES.about, 'Company', 'company'),
    singleton(careers, PAGES.careers, 'Company', 'company'),
    singleton(contact, PAGES.contact, 'Contact', 'primary'),
    singleton(fleet, PAGES.fleet, 'Fleet', 'primary'),

    /*
     * The form's landing page. It has no entry — it is a receipt rather than
     * content, and there is nothing on it for an editor to write — so it is
     * declared here rather than derived, and `noindex` keeps it out of the
     * sitemap. It is in this list at all so it gets an OG card: it is a URL a
     * reader can end up on and therefore one somebody can paste.
     */
    {
      path: '/contact/thanks',
      title: 'Message received',
      eyebrow: 'Contact',
      description: 'Your message is with the shop. We answer during shop hours.',
      noindex: true,
      group: 'primary',
      source: 'src/pages/contact/thanks.astro',
    },

    ...services.map((entry) =>
      fromEntry(entry, entryPath('services', entry.id), SECTIONS.services.label, 'services'),
    ),
    ...repairs.map((entry) =>
      fromEntry(entry, entryPath('repairs', entry.id), SECTIONS.repairs.label, 'repairs'),
    ),
    ...articles.map((entry) =>
      fromEntry(
        entry,
        entryPath('articles', entry.id),
        SECTIONS.articles.label,
        'articles',
        entry.data.updatedAt ?? entry.data.publishedAt,
      ),
    ),
    ...legal.map((entry) =>
      fromEntry(entry, entryPath('legal', entry.id), SECTIONS.legal.label, 'legal', entry.data.effectiveDate),
    ),
  ];
}

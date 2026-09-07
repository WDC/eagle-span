import type { CollectionEntry } from 'astro:content';

import { getSingleton, listArticles, listOfferings, listPublished } from './content.ts';
import { PAGES, SECTIONS, entryPath } from './routes.ts';
import { site } from '~/site.config.ts';

/**
 * Every page this site builds, as data.
 *
 * Two things need this list and neither of them is a template: the sitemap
 * needs a `lastmod` per URL, and `src/pages/og/[...slug].png.ts` needs to render
 * one image per page. Both were going to end up re-deriving "what pages exist"
 * from the collections, and a third copy of that derivation is a third place
 * for a page to be missed.
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

const fromEntry = (entry: Routed, path: string, eyebrow: string, contentDate?: Date): SitePage => ({
  path,
  title: entry.data.seo.title,
  eyebrow,
  description: entry.data.seo.description,
  noindex: entry.data.seo.noindex,
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
  ): SitePage => ({
    path,
    title: entry.data.seo.title,
    eyebrow,
    description: entry.data.seo.description,
    noindex: entry.data.seo.noindex,
    source: sourceOf(entry),
  });

  return [
    singleton(home, PAGES.home, `${site.address.locality}, ${site.address.region}`),
    singleton(servicesIndex, SECTIONS.services.index!, SECTIONS.services.label),
    singleton(repairsIndex, SECTIONS.repairs.index!, SECTIONS.repairs.label),
    singleton(articlesIndex, SECTIONS.articles.index!, SECTIONS.articles.label),
    singleton(about, PAGES.about, 'Company'),
    singleton(careers, PAGES.careers, 'Company'),
    singleton(contact, PAGES.contact, 'Contact'),
    singleton(fleet, PAGES.fleet, 'Fleet'),

    ...services.map((entry) => fromEntry(entry, entryPath('services', entry.id), SECTIONS.services.label)),
    ...repairs.map((entry) => fromEntry(entry, entryPath('repairs', entry.id), SECTIONS.repairs.label)),
    ...articles.map((entry) =>
      fromEntry(
        entry,
        entryPath('articles', entry.id),
        SECTIONS.articles.label,
        entry.data.updatedAt ?? entry.data.publishedAt,
      ),
    ),
    ...legal.map((entry) =>
      fromEntry(entry, entryPath('legal', entry.id), SECTIONS.legal.label, entry.data.effectiveDate),
    ),
  ];
}

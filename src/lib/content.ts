import { getCollection, getEntries, getEntry, type CollectionEntry, type ReferenceDataEntry } from 'astro:content';

import { LOCATIONS, type SingletonName } from './content-paths.ts';
import type { FaqItem } from './schema.ts';
import { typo } from './typography.ts';

/**
 * The two ways templates reach content, so the rules live in one place instead
 * of in fourteen `getStaticPaths` calls.
 *
 * Phase 4 builds the templates; this is the seam they build against.
 */

/** Collections whose entries become pages, and can therefore be held back. */
export const ROUTED = ['services', 'repairs', 'articles', 'legal'] as const;
export type RoutedName = (typeof ROUTED)[number];

/**
 * A singleton is required, so a missing file is an error rather than an
 * `undefined` that renders as an empty page. `astro build` fails with the name
 * of the file to create.
 */
export async function getSingleton<C extends SingletonName>(name: C): Promise<CollectionEntry<C>> {
  /*
   * The entry id is the file's basename, which is not always the collection's
   * name: the three index pages are `servicesIndex` in `services-index.mdoc`,
   * because a collection key has to be an identifier and a filename should read
   * like a filename. `content-paths.ts` is the only thing that knows which is
   * which, here as everywhere else.
   */
  const id = LOCATIONS[name].file;
  const entry = await getEntry(name, id);
  if (!entry) {
    throw new Error(
      `Missing required content: the "${name}" singleton has no entry at ${id}. Create it in /keystatic.`,
    );
  }
  return entry as CollectionEntry<C>;
}

/**
 * Everything in a routed collection except drafts.
 *
 * Draft filtering belongs here rather than in each template: a draft that ships
 * because one `getStaticPaths` forgot the filter is indistinguishable from
 * publishing it. Ordering is deliberately not applied — an index sorts by
 * `order`, an archive by date, and a helper that guessed would be overridden
 * everywhere anyway.
 */
export async function listPublished<C extends RoutedName>(collection: C): Promise<CollectionEntry<C>[]> {
  const entries = await getCollection(collection);
  return entries.filter((entry) => !entry.data.draft);
}

/**
 * Ordering, once each.
 *
 * `listPublished` deliberately does not sort — an index sorts by `order`, an
 * archive by date — but each of those orders is still one decision, and a
 * template that reimplemented it would be a template that could get it wrong.
 */

/** Services and repairs: the editor's `order`, ties broken on the nav label. */
export async function listOfferings<C extends 'services' | 'repairs'>(collection: C): Promise<CollectionEntry<C>[]> {
  const entries = await listPublished(collection);
  return entries.sort(
    (a, b) => a.data.order - b.data.order || a.data.navLabel.localeCompare(b.data.navLabel),
  );
}

/**
 * Every testimonial, in the order the collection declares.
 *
 * The homepage picks three by reference because it is a shop window. Every
 * other page that carries the quotes band wants "the testimonials", full stop
 * — there are three of them, an editor choosing which two a brake-repair page
 * shows would be choosing between three, and the reference list would be a
 * field on fourteen entries that nobody would ever set differently.
 */
export async function listTestimonials(): Promise<CollectionEntry<'testimonials'>[]> {
  return getCollection('testimonials');
}

/** Articles: newest first, on the revision date when there is one. */
export async function listArticles(): Promise<CollectionEntry<'articles'>[]> {
  const entries = await listPublished('articles');
  return entries.sort(
    (a, b) =>
      (b.data.updatedAt ?? b.data.publishedAt).getTime() - (a.data.updatedAt ?? a.data.publishedAt).getTime(),
  );
}

/**
 * FAQ entries behind a list of references, in the order the FAQ collection
 * declares rather than the order they happen to be referenced in.
 *
 * The `order` field is on the FAQ, not on the reference, so an answer reads the
 * same way on every page that uses it — which is what makes it safe to put the
 * same string in a `FAQPage` node on more than one page.
 */
export async function resolveFaqs(
  refs: readonly ReferenceDataEntry<'faqs', string>[],
): Promise<FaqItem[]> {
  if (refs.length === 0) return [];
  const entries = await getEntries([...refs]);
  return entries
    .sort((a, b) => a.data.order - b.data.order || a.data.question.localeCompare(b.data.question))
    /*
     * Typeset once, here, and handed to both consumers.
     *
     * An FAQ answer is rendered on the page and repeated as an `acceptedAnswer`
     * in the JSON-LD, and those two have to be the same string — a structured
     * answer that does not match the visible one is the thing Google issues
     * manual actions for. Markdoc's pipeline never touches these, because the
     * `faqs` collection deliberately has no Markdoc body (see
     * src/content.config.ts), so without this they would be the only copy on
     * the site that skipped Phase 2's typography. Running it in one place means
     * the page and the graph cannot end up with different quotes.
     */
    .map((entry) => ({ question: typo(entry.data.question), answer: typo(entry.data.answer) }));
}

/**
 * Referenced services or repairs, in the order they are referenced, minus
 * anything unpublished.
 *
 * `getEntries()` would be the obvious call and it is the wrong one: it resolves
 * a reference straight out of the store, drafts included. A homepage that
 * features a draft, or a service that links a draft as "related", publishes it
 * — the reference is a link, and the entry it points at builds a page. Going
 * through `listOfferings` means one filter guards every route into the
 * collection.
 *
 * The reference order is kept rather than the collection's: a featured list is
 * an editorial decision about sequence, which is the only reason to have one.
 */
export async function resolveOfferings<C extends 'services' | 'repairs'>(
  collection: C,
  refs: readonly { id: string }[],
): Promise<CollectionEntry<C>[]> {
  if (refs.length === 0) return [];
  const published = new Map((await listOfferings(collection)).map((entry) => [entry.id, entry]));
  return refs.flatMap((ref) => {
    const entry = published.get(ref.id);
    return entry ? [entry] : [];
  });
}

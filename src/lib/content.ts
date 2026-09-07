import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

import type { SingletonName } from './content-paths.ts';

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
  const entry = await getEntry(name, name);
  if (!entry) {
    throw new Error(`Missing required content: the "${name}" singleton has no entry. Create it in /keystatic.`);
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

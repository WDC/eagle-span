/**
 * Where content lives on disk — declared once, read by everything that needs it.
 *
 * Three things have to agree about the path of a `.mdoc` file: the Keystatic
 * collection that writes it, the Astro loader that reads it, and the gate that
 * checks nothing has been left behind. Two of those are configuration files
 * that look nothing alike, and a renamed directory in one of them is a silent
 * failure — the editor writes to a directory the build does not read, and the
 * page simply does not change.
 *
 * So none of them writes a path. They all derive one from here, which is the
 * same approach `src/lib/markdoc-tags.ts` takes to the tag list: the drift is
 * not gated, it is impossible.
 *
 * `ext` is the file extension Keystatic will produce, and it follows from the
 * schema rather than being a choice: a collection with a Markdoc content field
 * is written as `.mdoc` with YAML frontmatter, and one without is written as a
 * plain `.yaml` data file.
 */

export const CONTENT_DIR = 'src/content';

export type ContentExtension = 'mdoc' | 'yaml';

export type ContentLocation =
  /** Many entries in a directory, one file each, named by slug. */
  | { readonly kind: 'collection'; readonly dir: string; readonly ext: ContentExtension }
  /** Exactly one file. `dir` is empty for a file directly under `src/content`. */
  | { readonly kind: 'singleton'; readonly dir: string; readonly file: string; readonly ext: ContentExtension };

export const LOCATIONS = {
  services: { kind: 'collection', dir: 'services', ext: 'mdoc' },
  repairs: { kind: 'collection', dir: 'repairs', ext: 'mdoc' },
  articles: { kind: 'collection', dir: 'articles', ext: 'mdoc' },
  legal: { kind: 'collection', dir: 'legal', ext: 'mdoc' },
  faqs: { kind: 'collection', dir: 'faqs', ext: 'yaml' },
  testimonials: { kind: 'collection', dir: 'testimonials', ext: 'yaml' },
  accounts: { kind: 'collection', dir: 'accounts', ext: 'yaml' },

  home: { kind: 'singleton', dir: 'pages', file: 'home', ext: 'mdoc' },
  /*
   * The three index pages. Phase 4 added these: `/service`, `/repair` and
   * `/company/articles` each carry a title, a meta description, an H1 and a
   * lede on the live site, which makes them content — and the alternative was
   * four strings hard-coded in a template, which is the drift this whole file
   * exists to prevent. The file names say which singleton they are; the URLs
   * they render at are in src/lib/routes.ts and are not derivable from either.
   */
  servicesIndex: { kind: 'singleton', dir: 'pages', file: 'services-index', ext: 'mdoc' },
  repairsIndex: { kind: 'singleton', dir: 'pages', file: 'repairs-index', ext: 'mdoc' },
  articlesIndex: { kind: 'singleton', dir: 'pages', file: 'articles-index', ext: 'mdoc' },
  about: { kind: 'singleton', dir: 'pages', file: 'about', ext: 'mdoc' },
  contact: { kind: 'singleton', dir: 'pages', file: 'contact', ext: 'mdoc' },
  careers: { kind: 'singleton', dir: 'pages', file: 'careers', ext: 'mdoc' },
  fleet: { kind: 'singleton', dir: 'pages', file: 'fleet', ext: 'mdoc' },
  settings: { kind: 'singleton', dir: '', file: 'settings', ext: 'yaml' },
} as const satisfies Record<string, ContentLocation>;

export type ContentName = keyof typeof LOCATIONS;

type NamesOfKind<K extends ContentLocation['kind']> = {
  [N in ContentName]: (typeof LOCATIONS)[N]['kind'] extends K ? N : never;
}[ContentName];

export type CollectionName = NamesOfKind<'collection'>;
export type SingletonName = NamesOfKind<'singleton'>;

const directory = (location: ContentLocation) =>
  location.dir ? `${CONTENT_DIR}/${location.dir}` : CONTENT_DIR;

/**
 * The `path` a Keystatic collection is configured with.
 *
 * The trailing `/*` is what makes Keystatic write one file per entry, named by
 * its slug. A trailing slash would make it write `<slug>/index.mdoc` instead —
 * a directory per entry, which is the layout to move to once entries start
 * carrying their own images, and a migration when it happens rather than a
 * silent change of shape.
 */
export function collectionPath(name: CollectionName): `${string}/*` {
  return `${directory(LOCATIONS[name])}/*`;
}

/** The `path` a Keystatic singleton is configured with: one file, no glob. */
export function singletonPath(name: SingletonName): string {
  const location = LOCATIONS[name];
  return `${directory(location)}/${location.file}`;
}

/** The `base` and `pattern` an Astro `glob()` loader is configured with. */
export function globArgs(name: ContentName): { base: string; pattern: string } {
  const location: ContentLocation = LOCATIONS[name];
  return {
    base: directory(location),
    pattern: location.kind === 'collection' ? `**/*.${location.ext}` : `${location.file}.${location.ext}`,
  };
}

/** Where the gate should look: the directory, and the one file a singleton must have. */
export function expectedPaths(name: ContentName): { directory: string; file?: string; ext: ContentExtension } {
  const location: ContentLocation = LOCATIONS[name];
  return {
    directory: directory(location),
    ...(location.kind === 'singleton' ? { file: `${directory(location)}/${location.file}.${location.ext}` } : {}),
    ext: location.ext,
  };
}

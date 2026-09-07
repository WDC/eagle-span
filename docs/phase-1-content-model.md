# Phase 1 — Keystatic local mode and the Markdoc content model

ClickUp [86bbw07ru](https://app.clickup.com/t/86bbw07ru). This is the second
Phase 1 task: the first built the repo, the Astro skeleton and the CI gates, and
this one gives them something to hold.

Nothing here renders a page. Phase 3 migrates the copy and Phase 4 builds the
templates; this pass decides what a page *is* — which fields exist, what an
editor is allowed to write, where a file lives, and which of those decisions the
build refuses to let go wrong.

## Keystatic runs locally, and is not in the deployed site

The client confirmed a single editor and no CMS handover for now, and that
decision is worth more than it sounds.

`@keystatic/astro` injects two routes, `/keystatic/[...params]` and
`/api/keystatic/[...params]`, both `prerender: false`. In a production build
those are two serverless functions on Vercel: an admin UI, and an endpoint that
writes files. In local mode neither has any authentication in front of it —
none is needed, because the only way to reach them is a dev server bound to
`127.0.0.1`.

So the integration is not registered for a build at all. Not deployed behind
the SSO protection this project already runs, not gated on an environment
variable: absent. `src/integrations/keystatic-dev.ts` adds Keystatic and its
React runtime only when `command === 'dev'`, and imports both dynamically so a
production build never loads them.

What that buys:

* The deployed site has **no serverless functions**. Phase 5 adds exactly one,
  for the contact form, and `ALLOWED_FUNCTIONS` in
  `scripts/verify-static-build.mjs` is where that gets reviewed rather than
  assumed.
* No React in any page bundle.
* Nothing new for deployment protection to have to cover, which was the open
  question the task named.

`bun run verify:static-build` is the gate. It fails if the build produces a
function, if a Keystatic route reaches `dist/`, or if any built asset so much as
mentions Keystatic. Registering the integration unconditionally was tried
against it: the build succeeds, ships `_render.func` and a
`keystatic-page.*.js` chunk, and the gate catches both.

`@keystatic/astro` is held at `^5.2.0` rather than 6. Version 6 imports
`astro:env/server`, which Vite's dependency optimizer cannot resolve under
Astro 5 — every `astro dev` starts with an unhandled rejection and a stack
trace. The 5.x line is the one built for Astro 5 and its peer range still covers
2 through 7; revisit it with the Astro 6 upgrade.

### Flipping to GitHub mode later

Two changes, neither of them a migration:

```ts
// keystatic.config.ts
storage: { kind: 'github', repo: 'wdc/eagle-span' }
```

and dropping the `command` check in `src/integrations/keystatic-dev.ts` (plus
the authentication routes GitHub mode needs). Nothing else in the model depends
on the storage kind: no absolute filesystem paths, no assumption that a save is
synchronous, and every path written relative to the repository root, which is
how GitHub mode addresses them.

## The model

Six singletons and seven collections. Every entry carries an `seo` object.

| | Where | Written as | Why |
| --- | --- | --- | --- |
| `home` `about` `contact` `careers` `fleet` | `src/content/pages/{name}.mdoc` | Markdoc + frontmatter | One page each, each with its own shape |
| `settings` | `src/content/settings.yaml` | YAML | Choices about the site, no body |
| `services` (5) | `src/content/services/{slug}.mdoc` | Markdoc + frontmatter | `/services/{slug}` |
| `repairs` (9) | `src/content/repairs/{slug}.mdoc` | Markdoc + frontmatter | `/repairs/{slug}` |
| `articles` | `src/content/articles/{slug}.mdoc` | Markdoc + frontmatter | `/articles/{slug}` |
| `legal` | `src/content/legal/{slug}.mdoc` | Markdoc + frontmatter | `/company/{slug}` |
| `faqs` | `src/content/faqs/{slug}.yaml` | YAML | Referenced by pages, no route |
| `testimonials` | `src/content/testimonials/{slug}.yaml` | YAML | Referenced by pages, no route |
| `accounts` | `src/content/accounts/{slug}.yaml` | YAML | Referenced by pages, no route |

Singletons are one Astro collection each rather than one `pages` collection with
a superset schema. The whole point of a singleton is that its shape is its own:
the homepage needs featured entries and a stat rail, a legal page needs neither,
and a schema that makes both optional has stopped describing either.
`src/lib/content.ts` wraps the resulting `getEntry('home', 'home')`.

### Three files that cannot disagree

The model is written three times — as a Keystatic config, as an Astro schema,
and as whatever checks them — and each pair of those is a place to drift. Two of
the three pairs are removed by construction rather than gated:

* **`src/lib/content-paths.ts`** is the only file that knows where content
  lives. `keystatic.config.ts` derives its `path` from it and
  `src/content.config.ts` derives its `glob()` from it, so the directory the
  editor writes to is the directory the build reads. A renamed directory that
  only got changed on one side is the classic version of this bug: the editor
  saves, the build succeeds, and the page does not change.
* **`src/lib/markdoc-tags.ts`** is the only file that knows what a tag is.
  `markdoc.config.mjs` builds the Markdoc validation schema from it and
  `keystatic.config.ts` builds the editor's content components from it, so the
  editor cannot insert a tag the build rejects.

What is left is the field-by-field mirror between `keystatic.config.ts` and
`src/content.config.ts`, which is genuinely two things: one is the editing
experience, the other is the gate. Zod is the authority — it rejects bad
content whatever wrote it — and the two are kept close enough to read side by
side.

### The NAP is not content

No phone number, address, hours or business name appears in any schema. They are
in `src/site.config.ts`, which `verify:jsonld` gates against the Google Business
Profile, and body copy reaches them through three Markdoc tags:
`{% phone /%}`, `{% hours /%}` and `{% address /%}`.

This is the direct answer to the crawl's finding of five different phone formats
across the old site. Five formats existed because there were five places to type
one. Now there is one place, and body copy is not it.

### `seo`, with bounds that bite

```
title        1–70 characters, without the brand suffix
description  50–165 characters
image        optional; Phase 4 generates the default
noindex      default false
canonical    optional
```

`canonical` exists for Phase 3's archive consolidation: an article that is kept
but folded into another points at the survivor rather than competing with it.
`articles` also has `supersededBy`, so that decision is recorded once and the
redirect row and the canonical both follow from it.

The bounds are real limits, and the migration will feel them. Against the Phase
0 crawl:

* **4 meta descriptions** are over 165 characters — 174, 215, 278 and 289 — all
  on articles. Everything past roughly 160 is truncated in results, so those are
  defects being carried, not copy being lost.
* **4 article titles** are over 70 characters, up to 88. Articles are the only
  section without a brand suffix, so the number is the title itself.

Both lists are Phase 3 rewrites. That is the gate doing its job; if it turns out
to be the wrong call, it is one number in `src/content.config.ts`.

### Why `faqs`, `testimonials` and `accounts` have no body

Because their text has to be reproducible verbatim somewhere other than the
page. An FAQ answer becomes an `acceptedAnswer` in JSON-LD and a testimonial
becomes a `Review`, and structured data has to match what the reader sees. A
Markdoc body would render one string to the page and need a second, flattened
one for the graph — two copies of a sentence, which drift. Plain text has one.

### Two collections are deliberately empty

`testimonials` and `accounts` ship with a `NOTES.md` and no entries.

A testimonial is a claim that a named person said something about this business,
and which billing networks the shop honours is a fact about the business.
Writing plausible ones as scaffolding would put a fabricated review and a false
claim into the content repo — and the crawl already found the live homepage
rendering the literal placeholder "Position, Company name" above a reviewer's
name, which is the defect the collection exists to fix rather than to reproduce.
Both land in Phase 3 with the client's material.

The schema encodes the fix: `name` is required, `role` and `company` are
optional, so a template can never need a placeholder for either.

## Markdoc, not MDX

An MDX file can import a module and evaluate an expression, which makes every
content file a code file: reviewing copy means reviewing JavaScript, and the
safe-to-hand-over property this repo will eventually want is gone.

A Markdoc file can use six tags and nothing else. `@astrojs/markdoc` runs
`Markdoc.validate` on every file it loads and throws on an undeclared tag, a
missing required attribute or a value of the wrong type. That is the content
security model, and it is enforced by the build rather than by review.

| Tag | Kind | Attributes |
| --- | --- | --- |
| `{% callout %}` | wrapper | `tone` (note / caution / safety), `title` |
| `{% specs %}` | block | `label`, `rows` |
| `{% cta %}` | block | `label`, `href` |
| `{% phone %}` `{% hours %}` `{% address %}` | inline | none |

Two of those carry validation worth naming:

* **`cta.href`** must be a path on this site, a `tel:`, a `mailto:` or a
  fragment. Body copy is not where an off-site call to action belongs, and an
  unvalidated href in a content repo is how `javascript:` eventually gets in.
* **`specs.rows`** is checked structurally — a non-empty `label` and `value`, an
  optional `note`, nothing else — by a custom Markdoc attribute type. `Array`
  would have accepted an array of strings and rendered `[object Object]`.

A callout holds prose. Markdoc's own `children` restriction reports at `warning`
level and Astro only throws on `error`, so the declaration documents the rule and
a `validate` enforces it: a spec table nested inside a callout is a build
failure.

`src/lib/markdoc-tags.test.ts` builds a correct use of every tag from the
manifest and asserts it validates, then asserts eleven ways of getting it wrong
do not. It is where "no arbitrary JavaScript in the content repo" stops being a
claim.

### The text pipeline reaches Markdoc too

Markdoc has its own parser and renderer and never touches remark, so none of
Phase 2's typography applied to it. `src/lib/markdoc-typography.ts` overrides
three nodes to fix that:

* `text` gets smartypants, the non-breaking-space pass and normalization.
* `paragraph` and `heading` get widont, applied once per block to its final
  text run — which is the same thing `remark-typography.ts` does, and for the
  same reason. Applied per text node it would bind the words before every link
  in the paragraph instead of the ones at the end.

`markdoc-typography.test.ts` asserts a sentence comes out of Markdoc byte-identical
to the same sentence through `typo()`, which is what `.astro` copy gets.

The typography lint learned about Markdoc at the same time: a tag's string
attributes have to use straight quotes — a curly one is a parse error, not a
refinement — so tag syntax is skipped, including tags whose attributes run over
several lines. The prose inside a wrapper tag is still linted.

## Gates added

| Command | Gate |
| --- | --- |
| `bun run verify:content` | Every tag has a renderer, every singleton has its file, and nothing under `src/content` is read by nobody |
| `bun run verify:static-build` | No serverless function, no Keystatic route and no Keystatic reference in the built output |

Both are in `bun run check` and in the CI `gates` job. `bun test` grew two files:
the Markdoc typography pipeline and the tag validation.

The build itself is the third gate and the largest one: Zod rejects a missing
meta description, a testimonial with no name, an FAQ reference that points at
nothing, or a hero image with no alt text, and Markdoc rejects a tag that does
not exist.

## What Phase 3 and Phase 4 inherit

* **Content files are machine-written.** Keystatic rewrites a file on save, so a
  YAML comment in one does not survive being edited. Explanation belongs in this
  document, not in the content.
* **An inline tag must stay inline.** `{% address /%}` at the start of a line is
  parsed as a block and fails validation. The editor writes them inline; a hand
  edit can get it wrong, and the build says so.
* **Markdoc wraps rendered content in `<article>`.** Fine on an article page,
  worth deciding about on a service page — a Phase 4 template question.
* **Images are configured but not exercised.** Frontmatter images go to
  `src/assets/images`, body images to `src/assets/content`, both written as
  paths relative to the entry so Astro's `image()` resolves and optimizes them.
  Nothing uses them yet: the asset export is still blocked on the Webflow
  hosting item. If entries end up carrying their own images, moving a collection
  to a directory per entry is a one-line change in `content-paths.ts` and a file
  move — a migration when it happens, rather than a shape chosen now for a need
  that may not arrive.
* **`accounts` is modelled as fleet billing networks.** The task named the
  collection without defining it; that reading follows from the `fleet`
  singleton next to it. If it means something else, the schema is six fields.

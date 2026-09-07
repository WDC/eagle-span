# Phase 4 — page templates, the JSON-LD graph, OG generation, sitemap

ClickUp [86bbw0808](https://app.clickup.com/t/86bbw0808). Phase 1 decided what a
page *is*; this builds the things that render one. Every route the site will
have exists, every page carries the structured data it should, every page has an
open-graph card, and the sitemap carries dates that mean something.

Phase 3 migrates the copy. Nothing here waits on it: the templates build from
the seeded entries, and a template that works for one service works for five.

## What is on every page now

The Phase 1 shell had a `BaseLayout` with two empty slots and a homepage. There
was no navigation, no footer, no breadcrumb, and eleven of the site's thirteen
routes did not exist.

| Route | Source | Notes |
| --- | --- | --- |
| `/` | `home` singleton | Hero, stat rail, featured work, testimonials, FAQs |
| `/service` | `servicesIndex` | The services index — **new singleton**, see below |
| `/services/{slug}` | `services` | `Service` node, FAQs, related entries |
| `/repair` | `repairsIndex` | The repairs index — **new singleton** |
| `/repairs/{slug}` | `repairs` | Same template as a service |
| `/company/articles` | `articlesIndex` | The archive index — **new singleton** |
| `/articles/{slug}` | `articles` | `Article` node, byline, dates, topics |
| `/company/about` | `about` | |
| `/company/careers` | `careers` | Openings render; no `JobPosting`, see below |
| `/company/{slug}` | `legal` | Effective date, and a collision guard |
| `/contact` | `contact` | `LocationCard`, no Maps iframe |
| `/fleet` | `fleet` | The one new URL in the migration |
| `/404` | template | No OG card, `noindex` |

Plus `/sitemap.xml`, `/robots.txt` and one `/og/*.png` per page.

### Three singletons the Phase 1 model did not have

`/service`, `/repair` and `/company/articles` each carry a title, a meta
description, an H1 and a lede on the live site. Phase 1 modelled the fourteen
leaves and the seven articles but not the three pages that introduce them, which
left two options: four strings hard-coded in a template, or three more
singletons.

The strings would have been content living in a template — the exact drift
`content-paths.ts` and `content.config.ts` exist to prevent — and Phase 3 would
have had to undo it to migrate the copy. So the model grew: `servicesIndex`,
`repairsIndex` and `articlesIndex`, each `pageBase` and nothing more, in
`src/content/pages/{services,repairs,articles}-index.mdoc`.

They are the first singletons whose file name is not their collection name, and
that turned out to be a latent bug: `getSingleton()` was calling
`getEntry(name, name)`, which quietly assumed the two were the same. It now
takes the id from `content-paths.ts` like everything else does.

### The navigation exists because of defect 10

Phase 0 found `/service` and `/repair` in the sitemap and linked from none of
the thirty crawled pages. Every template linked the fourteen children directly
and skipped their parents, so the two index pages accumulated no internal link
equity at all.

The header links the two indexes on every page; the footer links all fourteen
children. Between them every page is one hop from every other. The header
deliberately does *not* link the children — fourteen links in a masthead is a
menu nobody reads and a link graph with no shape.

`related` on a service or repair is the other half: an entry names its own
neighbours, so lateral linking is content rather than a template's guess at
similarity. It resolves through `listOfferings`, not `getEntries`, so a
reference to a draft cannot publish one.

## The `<article>` question Phase 1 left open

> **Markdoc wraps rendered content in `<article>`.** Fine on an article page,
> worth deciding about on a service page — a Phase 4 template question.
> — `docs/phase-1-content-model.md`

Settled: the wrapper moves to the template.

`@astrojs/markdoc` renders the `document` node as `<article>`, unconditionally,
for every entry in every collection. That is a decision about what the content
*is*, and the content file is the one thing in the system that cannot make it —
a `.mdoc` file has no idea whether it is a blog post or the middle third of a
service page. The template always knows.

So `document` now renders `src/components/markdoc/Prose.astro`, a `div.prose`
with no semantics, and:

* `/articles/{slug}` wraps the whole page — header, hero and body — in one
  `<article>`. Which is what the element is for, and what the nested
  `<article>` inside an `<article>` was getting wrong before.
* Services, repairs, legal and the company pages put the body in a labelled
  `<section>`. A service page's copy is not a self-contained composition that
  would make sense syndicated on its own.

`NODE_COMPONENTS` in `src/lib/markdoc-tags.ts` is the declaration, the same way
`TAGS` is for tags, and `verify:content` checks both components exist —
`document` and `link` are not tags an editor inserts, so no content file
exercises them by name and a typo in either path would only surface as a broken
page.

`.prose` in `global.css` is the styling that came with it: rhythm only, since
the tags a body can use bring their own rules.

## The graph

`src/lib/schema.ts`, one `<script type="application/ld+json">` per page, always
one `@graph`.

| Node | Where | From |
| --- | --- | --- |
| `AutoRepair` | every page | `site.config.ts` |
| `hasOfferCatalog` | every page | every published service and repair |
| `WebSite` | every page | |
| `WebPage` | every page | narrowed to `CollectionPage`, `ContactPage`, `ItemPage`, `AboutPage` |
| `BreadcrumbList` | every page below the root | the same array the visible trail renders from |
| `Service` | 14 service and repair pages | **Phase 0 defect 8** |
| `FAQPage` | home, fleet, any offering with FAQs | the `faqs` collection |
| `Article` | article pages | replaces the live site's `BlogPosting` |

One rule runs through it: **a node describes something the reader can see on the
page it is on.** Three of those are now gated rather than trusted —
`verify:jsonld` strips the page to its visible text and checks every breadcrumb
name, every FAQ question and every FAQ answer appears in it.

The FAQ half of that needed a change in `resolveFaqs()`: the answer is now run
through `typo()` once and handed to both the page and the graph. The `faqs`
collection has no Markdoc body by design, so its text was the only copy on the
site skipping Phase 2's typography — and typesetting it in one of the two places
would have made them differ by a quote mark.

### `hasOfferCatalog` is on every page

The whole service list, from any page, rather than only from the two index pages
nothing linked to. Each `Offer` inlines a minimal `Service` — `@id`, name, url —
rather than referencing the full node by `@id` alone, because that node lives on
the service's own page and a reference to a node absent from *this* page's graph
is one a consumer may ignore. `verify:jsonld` checks every offer names a page
the build actually produced.

### Two nodes deliberately absent

**No `Review`.** Google's structured-data policy disallows review markup a
business writes about itself. The crawl also found the live homepage rendering
the literal placeholder `Position, Company name` over a reviewer's name — that
string in a `Review` node is what it looks like in a search result. Testimonials
render as quotes on a page, with real attribution or none.

**No `JobPosting`.** The type requires `datePosted`, `validThrough`,
`hiringOrganization` and a location; the `openings` in the content model carry a
role, an employment type and a summary. A JobPosting with no posting date is a
listing in Google for Jobs that can never expire. If indexed listings are wanted
the schema grows three fields first and the node follows from them.

### Breadcrumbs name only ancestors that exist

`crumbsFor()` adds a section crumb only when that section has an index page. So
a service is `Home / Services / Wheel Alignment` and a legal page is
`Home / Privacy Policy` — two deep, because `/company` is not a page. The live
site 404s it and the redirect map sends it to `/company/about`, which is a
sibling, not a parent. A crumb pointing there would describe a hierarchy that
does not exist.

The homepage shows no trail and emits no node: a one-item BreadcrumbList says
nothing.

## Open-graph cards

One per page, 1200×630, drawn at build by satori (layout → SVG) and resvg
(SVG → PNG). Both run in-process during `astro build`, so the site keeps the
property Phase 1 bought: no serverless functions, and `verify:static-build` is
still the gate on that.

The card is the site's own language — rail label, hairline, headline, NAP along
the bottom — set in the same letterforms as the page. Which is the awkward part:
**satori cannot read woff2**, and cannot read a variable font's named instances
either. It wants one static file per weight, in ttf, otf or woff.

So `scripts/build-fonts.py --og-only` emits two static instances of the same
pinned upstream, subset the same way, at the two weights `tokens.css` uses. They
live in `data/og-fonts/` and **not** in `public/` — nothing serves them, and
putting them under `public/` would ship 58 KB of duplicate letterforms to every
visitor and put them in the Lighthouse font budget. `verify:fonts` checks their
digests and checks they have not appeared under `public/fonts`.

`--og-only` is a separate mode on purpose. A full `fonts:build` renames both
shipped woff2 files and rewrites `fonts.css` and the preload module every time
it runs, because woff2's brotli output is not reproducible across fontTools
versions — churn in a diff, for identical letterforms. The OG fonts *are*
reproducible (`recalcTimestamp=False`), which is what makes their digest gate
meaningful.

The 404 is the one page with no card: nothing links to a 404 and nobody shares
one. It passes `image={null}`, and `verify:jsonld` knows about that one
exception and requires a card everywhere else — resolving to a file that is
actually in the build.

## `lastmod`, and why the sitemap integration is gone

`@astrojs/sitemap` derives its URLs by scanning built routes, which it does
well, and it has no way to answer the question this phase is about: when did
this page last change? Its `lastmod` is the build time.

Build time is the wrong answer and an actively harmful one. It claims every page
on the site was rewritten on the day of the last deploy — for a fourteen-page
shop that redeploys on a dependency bump, that is a claim of constant churn, and
Google's documented response to dates it cannot trust is to ignore the dates
entirely. A wrong `lastmod` is worse than none.

`src/lib/lastmod.ts` has two sources and no third:

1. **The content**, where the schema carries a date — an article's `updatedAt`
   or `publishedAt`, a legal page's `effectiveDate`. An editor asserting when
   something changed outranks a commit that reflowed its frontmatter.
2. **Git**, for everything else: the commit that last touched the entry's file.
   Automatic, which matters — a manual `updatedAt` on fourteen service pages is
   a field nobody will remember to set.

When neither can answer, the URL ships **without** `lastmod`. There is no branch
in that module that can return the current time.

Git history has to be there to be read, and in CI it usually is not:
`actions/checkout` clones at depth 1, and in a one-commit clone
`git log -1 -- <file>` returns the tip commit for *every* path — the build-time
lie wearing a different hat. `lastmod.ts` detects the shallow clone, disables
the git source and says so; `.github/workflows/ci.yml` now sets
`fetch-depth: 0`.

**Vercel's build clone is shallow.** A production build therefore emits `lastmod`
only for the pages whose content carries a date. That is the honest failure mode
rather than a good one, and the fix — if it matters — is a `VERCEL_DEEP_CLONE`
style deploy setting or generating the sitemap in CI. Worth revisiting at the
Phase 7 cutover; not worth a wrong date now.

`src/pages/sitemap.xml.ts` replaces the integration, at `/sitemap.xml` rather
than `/sitemap-index.xml` — that is the path the live site serves and the one
Search Console already has on file, and fourteen URLs are four orders of
magnitude short of needing an index. `noindex` pages are filtered out: a sitemap
asks for a page to be indexed and a robots meta refuses, and a page in both is a
contradiction a crawler resolves by trusting neither.

`src/pages/robots.txt.ts` is new too. Webflow generated one and this repo did
not, which would have left the sitemap at a path no crawler was told about.

## The Maps iframe

Replaced by not having one. `src/components/LocationCard.astro` renders the
address, phone, hours and area served as a data column plus a link to the
listing — which is what the iframe was for, at the cost of one request this
origin serves itself instead of ~900 KB of third-party JavaScript, a set of
cookies the site otherwise never sets, and therefore a consent question.

**The static map image itself is not here.** `staticMap` in `site.config.ts` is
typed and `null`, and `LocationCard` renders it the moment it is filled in.
There is no honest way to produce the image today: the Maps Static API needs a
billed key, and a screenshot carries no licence to redistribute. The contact
page is correct without it. This is the one part of the task's brief that is
blocked on something the repo does not have, rather than done.

## Gates

| Command | What it now covers |
| --- | --- |
| `bun run verify:content` | …and every Markdoc *node* component, not just tags |
| `bun run verify:fonts` | …and the OG font digests, and that they are not served |
| `bun run verify:jsonld` | `Service` on all 14 offering pages; breadcrumb names, FAQ questions and FAQ answers present in the visible text; every `hasOfferCatalog` offer and every `og:image` resolving to something the build produced |
| `bun run verify:sitemap` | **new** — the sitemap and the built site list the same pages, `noindex` on neither side of the contradiction, dates well-formed and not in the future, every URL dated when git history is available, `robots.txt` naming the sitemap |

`verify:sitemap` is in `bun run check` and in the CI `gates` job. It exists
because dropping the integration cost the one thing it guaranteed for free: that
the sitemap could not disagree with the site it was built from.

"Never the build time" is *not* checked there, because it cannot be — today's
commits produce today's date and the two are indistinguishable after the fact.
It is structural, in `lastmod.ts`, and the fallback is silence.

## What Phase 5 and Phase 6 inherit

* **`/fleet` and `/services/fleet-services` will read as duplicates** until
  Phase 3 gives the fleet page its own copy. They are meant to be different
  things — one sells the work, the other is the programme around it: billing
  networks, scheduling a yard of trucks. If Phase 3 cannot make that distinction
  real, the honest move is to fold `/fleet` into the service page and add a
  redirect row rather than ship two pages competing for one query.
* **The brand suffix is appended in `BaseLayout`, uniformly.** `seo.title` is
  bounded at 70 characters "without the brand suffix", so a title at the bound
  renders at 83 — past where a search result truncates. Phase 3 is already
  rewriting four article titles for that bound; the number to watch is the
  rendered one.
* **`accounts` and `testimonials` are still empty**, so the fleet billing list
  and the homepage quotes render as nothing rather than as fixtures. Both are
  Phase 3 with the client's material, and the templates handle the empty case
  because that is the state they were built in.
* **Hero images are wired but unexercised.** Every routed template renders
  `hero`/`heroAlt` when present; no entry has one, because the asset export is
  still blocked on the Webflow hosting item.
* **The contact form is Phase 5**, and `formIntro` / `formSuccess` are already
  in the content model so the copy around it is written by an editor rather than
  living inside the function. `ALLOWED_FUNCTIONS` in
  `scripts/verify-static-build.mjs` is where that one function gets reviewed.

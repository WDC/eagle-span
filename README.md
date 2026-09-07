# EagleSpan Corporation — website

Replacement for the Webflow/Dieselmatic site at `www.eaglespancorp.com`.

Astro 5 (`output: 'static'`) on Vercel, Bun tooling, TypeScript strict. The only
non-static route will be the contact function in Phase 5.

## Getting started

```bash
bun install
bun run dev
```

## Gates

`bun run check` runs the static gates in the order CI does.

| Command | Gate |
| --- | --- |
| `bun run typecheck` | `astro check`, zero errors |
| `bun run lint` | ESLint, zero warnings |
| `bun run lint:typography` | Straight quotes, `--`, lowercase `x`, missing nbsp before units — 13 rules |
| `bun test` | Text pipeline, remark plugin, every typography lint rule |
| `bun run verify:fonts` | woff2 digests, `fonts.css` and preload references, required OpenType features, font budget, OG font digests |
| `bun run verify:tokens` | Text-token contrast (AA on both grounds), reserved use of target green |
| `bun run verify:content` | Every Markdoc tag and node has a renderer, every singleton has its file, no orphan content |
| `bun run redirects:build` | Regenerates `vercel.json` from `data/redirects.csv` |
| `bun run build` | Astro build — also where content schemas and Markdoc tags are validated |
| `bun run verify:static-build` | No serverless function, no `/keystatic` route, no Keystatic in the output |
| `bun run verify:jsonld` | JSON-LD parses, NAP matches `site.config`, canonical present, a `Service` node on all 14 offering pages, breadcrumbs and FAQ text visible on the page, `og:image` in the build |
| `bun run verify:sitemap` | The sitemap and the built site list the same pages, `noindex` on neither side, real dates, `robots.txt` names it |
| `bun run verify:motion` | Every animation behind `prefers-reduced-motion: no-preference`, no forwards fill on a time-driven animation, both ends of the title morph derived from one function, no literal `transition:name` in the build, the hero readout resting at 0.00° |
| `bun run verify:redirects <origin>` | One hop, right destination, and a live destination for pages this build produces |

`verify:redirects`, Lighthouse and axe need a deployed origin, so CI runs them
against the preview URL once `PREVIEW_URL` is set as a repository variable.

### Getting CI past deployment protection

The Vercel project has SSO deployment protection on, scoped
`all_except_custom_domains`. Every preview URL answers `302 →
vercel.com/sso-api`: a human gets a Vercel login page, and CI — which has no
browser and no Vercel account — gets a redirect it cannot follow. Pointed at a
protected origin with nothing else configured, all three gates fail on every run
and none of the failures are about this site.

Vercel's answer is a **Protection Bypass for Automation** token: a random string
that, sent with a request, skips the protection check for that request. Previews
stay private to everyone else; CI gets in. It is a credential, so it lives in a
GitHub *secret*, not a variable.

Two settings make the job run:

| Name | Kind | Value |
| --- | --- | --- |
| `PREVIEW_URL` | repository **variable** | the origin to test, no trailing slash |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | repository **secret** | the token from Vercel |

To set it up:

1. In Vercel, open the `eagle-span-website` project → **Settings** →
   **Deployment Protection**. Under **Protection Bypass for Automation**, click
   **Add Secret**, then copy the generated value.
2. In GitHub, open **Settings** → **Secrets and variables** → **Actions**. On
   the **Secrets** tab, **New repository secret**, named exactly
   `VERCEL_AUTOMATION_BYPASS_SECRET`, and paste the value.
3. On the **Variables** tab of the same page, **New repository variable**, named
   `PREVIEW_URL`, set to the origin you want gated — a stable one, since a
   per-branch preview URL changes with the branch name.

Each of the three gates takes it differently, because the tools differ:

* `verify:redirects` reads `VERCEL_AUTOMATION_BYPASS_SECRET` from the
  environment and sends it as an `x-vercel-protection-bypass` header. It
  preflights the origin first, so a missing or stale token reports itself as a
  protection problem rather than as six broken redirects.

  It needs `dist/` — run `bun run build` first. The redirect hop is always
  enforced, but a destination this build does not produce yet reports as
  *pending* rather than failing: until Phase 3 migrates the content, most
  destinations are pages the site has not built, and a gate that sits red for
  weeks is a gate everyone learns to ignore. Each pending row becomes a real
  check by itself as its page lands — there is no flag to remember.
* **Lighthouse** takes no header input on the action, so CI writes a
  `lighthouserc.json` at run time carrying `collect.settings.extraHeaders` and
  passes it as `configPath`. A header, not a query parameter — the results
  artifact is uploaded, and a token in a URL would be inside it.
* **axe** has no header option at all, so there the token goes in the query
  string with `x-vercel-set-bypass-cookie`, which makes Vercel set a cookie and
  redirect to the clean URL. The audited page carries no token, GitHub masks the
  value in the log, and the step uploads nothing.

Regenerating the token in Vercel invalidates the old one, so update the GitHub
secret at the same time. If you would rather not run a token at all, point
`PREVIEW_URL` at a custom domain — those are already exempt under the current
protection scope — and leave the secret unset.

The link check runs in CI as a lychee action. To reproduce a failure locally
rather than iterating through CI, install the same binary and run the same
arguments against `dist/`:

```bash
cargo install lychee --locked
bun run build
lychee --no-progress --include-fragments --root-dir "$PWD/dist" \
  --exclude '^https://www\.eaglespancorp\.com' \
  --exclude-path dist/fonts/OFL.txt \
  dist
```

## How redirects work

`data/redirects.csv` is the source of truth — one row per URL, and the `reason`
column is required. `scripts/build-vercel-json.mjs` generates `vercel.json` from
it and rejects duplicates, self-redirects and chains at build time.

`vercel.json` is committed so redirect changes show up in review. CI runs the
generator with `--check` and fails if it is stale.

Redirects emit an explicit `"statusCode": 301`. Vercel's `"permanent": true`
emits a 308; Google treats the two identically but much of the SEO tooling this
migration will be audited with does not.

## Type

Self-hosted subset of Source Sans 3, shipped as `Eagle Span Sans`: one variable
file per style, 63.9 KB roman (preloaded) and 60.0 KB italic (on demand), with
four zero-byte metric-adjusted fallback faces so the swap moves no text.

The font was chosen for its figures. The design runs old-style proportional in
prose and lining tabular in specs, which needs a family that actually ships
`onum` and `pnum` — `font-variant-numeric` fails silently when a feature is
absent. Source Sans 3 has no `lnum`/`tnum` because its defaults are already
lining tabular, so `.u-tabular` works by overriding the inherited value rather
than by requesting a feature. That is a real dependency on this font and
`verify:fonts` asserts it.

Regenerate with `bun run fonts:build` (needs `pip install 'fonttools[woff]'
brotli`). The upstream files are pinned by sha256; the built subsets, the
generated CSS, the preload module and `data/fonts.json` are all committed and
checked against each other in CI.

Copy runs through `smartypants → nbsp → widont → normalization`: markdown gets
stages 2–4 from `src/lib/remark-typography.ts`, and `.astro` strings call
`typo()` from `src/lib/typography.ts`. The lint gates the source, the pipeline
gates the page — see `docs/phase-2-design-system.md` for why both.

## Motion

One custom animation on the site: the home hero **thrust-angle** diagram. A
top-down axle set 2.40° out of square against the geometric centerline, which
resolves as the readout counts to 0.00°.

Two rules hold everywhere, and `verify:motion` enforces both:

* **The resting state is the final frame.** The markup and the unanimated CSS
  render the aligned truck and 0.00° — the thing that is true. Every animation
  runs *from* a disturbed state back to the element's own resting value, so none
  of them fills forwards, and the readout's odometer column rests on its last
  stop. Reduced motion, an unsupported browser and a failed stylesheet all land
  on the same correct drawing.
* **Motion is opt-in.** Everything animated sits inside
  `@media (prefers-reduced-motion: no-preference)` — not a `reduce` override,
  because a browser that does not know the feature matches neither query and the
  still version is the safe one.

The rest is restraint: cross-document view transitions carrying an index row's
title into the H1 of the page it opens (`fallback="none"`, so browsers without
the feature navigate normally rather than having it faked in script), and native
scroll-driven section reveals with no observer and no toggled class. Total
script on the site is 5.8 KB gzipped against a 50 KB budget.

See [`docs/phase-2-motion.md`](docs/phase-2-motion.md) for the timing table, why
the resolve is linear, the directive-versus-attribute trap in `transition:name`,
and the deferred diagrams.

## Content

Content is edited in **Keystatic**, running in local mode:

```bash
bun run dev     # then open http://127.0.0.1:4321/keystatic
```

Local mode reads and writes the working tree directly — no GitHub app, no OAuth
callback, no tokens in Vercel. The integration is registered for `astro dev`
only, so `/keystatic` and its write endpoint do not exist in a production build,
the deployed site stays entirely static, and there is no unauthenticated write
endpoint on a public origin. `bun run verify:static-build` fails if that ever
stops being true.

Bodies are **Markdoc**, not MDX: content cannot import a module or evaluate an
expression, and the only tags it can use are the six declared in
`src/lib/markdoc-tags.ts`. The build rejects anything else.

Three of those tags — `{% phone %}`, `{% hours %}` and `{% address %}` — render
the NAP from `src/site.config.ts`, because body copy is the one place a phone
number could otherwise still be typed by hand.

Nine singletons (`home`, `about`, `contact`, `careers`, `fleet`, `settings`, and
the three index pages `servicesIndex`, `repairsIndex`, `articlesIndex`) and seven
collections (`services`, `repairs`, `articles`, `legal`, `faqs`, `testimonials`,
`accounts`) live under `src/content/`. Paths are declared once in
`src/lib/content-paths.ts` and read by both configs, so the directory the editor
writes to is the directory the build reads. **URL** paths are declared once in
`src/lib/routes.ts`, which is the same idea for the other half of a page.

See [`docs/phase-1-content-model.md`](docs/phase-1-content-model.md) for the
schemas, the SEO bounds and what the migration inherits, and
[`docs/phase-4-templates.md`](docs/phase-4-templates.md) for the templates, the
JSON-LD graph and how `lastmod` is derived.

The homepage hero image is optional and **replaces** the thrust-angle diagram
rather than stacking under it. The Keystatic field says so; `docs/phase-2-motion.md`
says why.

## NAP

`src/site.config.ts` is the only place a phone number, address or set of hours
is written. The old site emitted five phone formats and two spellings of the
business name. `verify:jsonld` fails the build if rendered markup drifts from
that file.

The name spelling is settled: two words, "Eagle Span Corporation", matching the
Google Business Profile. Every rendered instance — page copy, footer, JSON-LD
and the open-graph cards — comes from that one object.

## Layout

```
data/       redirects.csv (redirect map), url-inventory.csv (parity sheet),
            fonts.json (font manifest — generated),
            og-fonts/ (static instances for the OG renderer — generated, never served)
docs/       phase findings
public/
  fonts/    subset woff2 + OFL.txt (generated)
scripts/    build + verification CLIs, and their tests
src/
  components/ header, footer, breadcrumbs, index lists, the page templates,
              ThrustAngle (the hero diagram)
    markdoc/  a renderer per custom tag and per overridden node
  content/    the content itself — Keystatic writes here, Astro reads it
  integrations/ dev-only Keystatic wiring
  layouts/    BaseLayout
  lib/        schema graph, routes, page inventory, lastmod, OG renderer,
              text pipeline, remark plugin, content and tag manifests
  pages/      routes, plus sitemap.xml, robots.txt and the /og/*.png endpoint
  styles/     tokens.css, fonts.css (generated), global.css

keystatic.config.ts    the editor — collections, singletons, fields
markdoc.config.mjs     the tag schemas, built from src/lib/markdoc-tags.ts
src/content.config.ts  the gate — a Zod schema per collection
```

Generated files are committed so they show up in review, and every one of them
has a CI gate that fails if it drifts from its source.

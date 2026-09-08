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
| `bun run verify:tokens` | Text-token contrast on the light grounds, the washes and the dark band, the `.t-deep` mapping resolved and checked through, and the mark-only colours (target green, amber, ink-4) kept out of `color:` |
| `bun run verify:content` | Every Markdoc tag and node has a renderer, every singleton has its file, no orphan content |
| `bun run redirects:build` | Regenerates `vercel.json` from `data/redirects.csv` |
| `bun run build` | Astro build — also where content schemas and Markdoc tags are validated |
| `bun run verify:static-build` | One serverless function and only the three routes allowed to reach it, no `/keystatic` route, no Keystatic in the output |
| `bun run verify:jsonld` | JSON-LD parses, NAP matches `site.config`, canonical present, a `Service` node on all 14 offering pages, breadcrumbs and FAQ text visible on the page, `og:image` in the build |
| `bun run verify:sitemap` | The sitemap and the built site list the same pages, `noindex` on neither side, real dates, `robots.txt` names it |
| `bun run verify:motion` | Every animation behind `prefers-reduced-motion: no-preference`, no forwards fill on a time-driven animation, both ends of the title morph derived from one function, no literal `transition:name` in the build, the hero readout resting at 0.00° |
| `bun run verify:forms` | Both forms in the built HTML, every field against the manifest, `method`/`action`/`enctype` so they submit with no JavaScript, the honeypot out of the tab order, and every `tel:` link carrying the click-to-call hook |
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
  --exclude '^https://(fastly\.)?picsum\.photos' \
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

One custom *drawing* animation on the site: the home hero **thrust-angle**
diagram. A top-down axle set 2.40° out of square against the geometric
centerline, which resolves as the readout counts to 0.00°.

Everything else that moves is scroll-driven or a hover transition — section and
item reveals, the masthead's shadow, the article reading progress bar. None of
it is JavaScript, and the two rules below hold for all of it. `verify:motion`
enforces both:

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
scroll-driven reveals with no observer and no toggled class. Total script on the
site is 5.8 KB gzipped against a 50 KB budget — unchanged by the interface work,
because none of it is script.

The scroll-driven pieces each degrade to something correct rather than to
something missing: a reveal that never runs is content that was always visible,
a masthead that cannot animate keeps its hairline, and the reading progress bar
is `display: none` until the browser proves it can drive it — a progress bar
that cannot progress is a green line across somebody's screen.

See [`docs/phase-2-motion.md`](docs/phase-2-motion.md) for the timing table, why
the resolve is linear, the directive-versus-attribute trap in `transition:name`,
and the deferred diagrams, and
[`docs/phase-4.5-visual-polish.md`](docs/phase-4.5-visual-polish.md) for the
scroll-driven additions.

## The visual system

The page is built from full-bleed **bands** rather than one white column: white
for reading, `--c-ground-2` for indexes, a wash for anything advisory, and a
dark band for the two moments a page makes a claim rather than explaining one —
the shop's numbers and the closing action. The footer is the third.

The dark band is `.t-deep`, and it works by **remapping the ground and ink
tokens** rather than by restyling anything. Every component reads `--c-ink-2`
and `--c-rule` rather than a literal colour, so a component dropped into a band
inverts without knowing the band exists. `verify:tokens` parses that rule,
resolves the mapping and runs the same AA check through it, so an ink left
unmapped — which would keep its light value on near-black — fails the build.

Three colour rules are gated rather than documented:

* **Mark colours never carry text.** `--c-target` (3.37:1), `--c-amber` (4.46:1
  on the red wash) and `--c-ink-4` (3.31:1) are rules, ticks and 2px borders.
  Each has an ink twin for the cases where it has to be read — and the dark band
  has its own four, because a colour that clears AA on white does not clear it
  on near-black.
* **A wash is a ground.** The four tints are in the contrast check alongside
  white, because a callout is a tint with body copy on it.
* **Tone is never colour alone.** A callout carries its tone in the label, the
  axis weight and the wash, because each of those fails somewhere — print,
  forced colours, colour vision.

Interaction is CSS and native elements throughout: the narrow-viewport menu and
the FAQ accordion are `<details>`, the panels and rows respond on hover through
transitions, and the sticky masthead earns its shadow from a scroll timeline.
See [`docs/phase-4.5-visual-polish.md`](docs/phase-4.5-visual-polish.md) for
what changed from Phase 2 and why, including the FAQ decision this reverses.

## Photography, and the placeholders standing in for it

**Every image on the site is a placeholder and says so on the page.** The shop
shoot and the Webflow asset export are both open blockers (ClickUp 86bbw07ex and
86bbw07c4), and the design has always assumed heavy photography — so the slots
are filled from a public CDN, seeded per slot, under a visible badge.

Everything comes from `src/lib/placeholders.ts`. The seed names the slot
(`home-shop-bays`), not the picture, so the same photograph comes back on every
build; the alt text describes the slot rather than the picture, because saying
an unrelated photograph is the shop floor would be a lie told specifically to
the reader who cannot see it.

Two gates carry a temporary allowance for them, and **both revert when the
photographs land**:

* `lighthouse-budget.json` allows 24 third-party requests. **The design number
  is 0.**
* The CI link check skips the CDN — thirty-odd requests a run at one host fails
  on a rate limiter rather than on a broken link.
* The CSP's `img-src` names both picsum origins. That line was missing when the
  placeholders landed, so on a deployed origin every one of them was blocked and
  only the badge rendered — invisible locally, because the CSP lives in
  `vercel.json` and nothing serves it under `astro dev`.

Replacing them is deleting `src/lib/placeholders.ts` and following the type
errors.

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

All 30 crawled pages have been migrated: 5 services, 9 repairs, 7 articles, 2
legal pages, 9 singletons, 35 FAQs, 3 testimonials and 3 accounts. The copy is
the live site's, with the phone numbers replaced by tags, four over-length
titles rewritten to the schema bound, and US spelling and typography made
consistent.

Two things need a person before launch. **The legal pages were rewritten rather
than migrated** — the live ones are an unedited template naming AES Truck Repair
of Springfield, MO — and the replacements have not been through legal review.
**The national account list and the stat rail** are transcribed from a logo band
and a paragraph, and both are claims a fleet customer acts on.

See [`docs/phase-1-content-model.md`](docs/phase-1-content-model.md) for the
schemas, the SEO bounds and what the migration inherits,
[`docs/phase-4-templates.md`](docs/phase-4-templates.md) for the templates, the
JSON-LD graph and how `lastmod` is derived, and
[`docs/phase-3-content.md`](docs/phase-3-content.md) for what the migration
changed, the defects reading the copy turned up, and the decisions it left
open.

The homepage hero image is optional and **replaces** the thrust-angle diagram
rather than stacking under it. The Keystatic field says so; `docs/phase-2-motion.md`
says why.

## Forms

Two forms — a service request on `/contact`, an application on
`/company/careers` — both posting to `/api/contact`, which is the **one**
serverless function the deployed site carries. `verify:static-build` gates that:
it checks the routing table, not just the function count, because the adapter
bundles every on-demand route into one function.

They work with no JavaScript. A real `method="post"`, native validation
attributes, and a 303 to `/contact/thanks` on success or to
`/contact#form-problem` on failure — where a panel hidden until it is the
`:target` shows the message with no script and no query string. With scripting
the same submission goes by `fetch` and the reader keeps their place.

`src/lib/forms/fields.ts` declares what each form asks. The component renders
from it, the endpoint validates against it, and `verify:forms` checks the built
HTML carries it — so a renamed field cannot silently stop being validated.

Four spam layers: a honeypot, a timing trap, Turnstile, and an Upstash rate
limit. All four fail **open**, deliberately. A missing Turnstile token is what a
reader with JavaScript off looks like, so it is delivered and marked
`unverified` under a stricter rate limit rather than refused; an outage at
Cloudflare or Upstash does not close the form. One missed message about a truck
that is down costs more than a spam that got through.

Every submission goes to two places — an email through Resend and a task on the
ClickUp Leads list — and either one succeeding is a success. Email is not
durable storage.

`docs/phase-5-forms.md` has the whole of it, including the one deviation from
the phase brief: uploads post with the form rather than through a presigned PUT,
because a presigned PUT needs JavaScript.

### Configuration

None of it is required — the site builds and the form renders with nothing set,
and `src/lib/forms/env.ts` reports the state in every log line. What changes is
what the form can do.

| Variable | Unset means |
| --- | --- |
| `PUBLIC_TURNSTILE_SITE_KEY` | No widget; every submission is `unverified`. Build-time, so changing it needs a rebuild |
| `TURNSTILE_SECRET_KEY` | Tokens are not verified |
| `RESEND_API_KEY`, `LEAD_FROM_EMAIL`, `LEAD_TO_EMAIL` | No email. All three or none |
| `CLICKUP_API_TOKEN`, `CLICKUP_LEADS_LIST_ID` | No lead on the board |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | No rate limit |
| `BLOB_READ_WRITE_TOKEN` | Uploads are dropped, and the lead says so |

The email variables have nothing correct to be set to yet: the mailbox
(`service@eaglespancorp.com`) and the sending domain verification are both open
blockers. With ClickUp configured and Resend not, a lead still reaches the shop.

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
    forms/    Form.astro — both forms, rendered from the field manifest
    markdoc/  a renderer per custom tag and per overridden node
  content/    the content itself — Keystatic writes here, Astro reads it
  integrations/ dev-only Keystatic wiring
  layouts/    BaseLayout
  lib/        schema graph, routes, page inventory, lastmod, OG renderer,
              text pipeline, remark plugin, content and tag manifests
    forms/    the field manifest, validation, spam screening, delivery
  pages/      routes, plus sitemap.xml, robots.txt, the /og/*.png endpoint
              and api/contact.ts — the one on-demand route
  styles/     tokens.css, fonts.css (generated), global.css

keystatic.config.ts    the editor — collections, singletons, fields
markdoc.config.mjs     the tag schemas, built from src/lib/markdoc-tags.ts
src/content.config.ts  the gate — a Zod schema per collection
```

Generated files are committed so they show up in review, and every one of them
has a CI gate that fails if it drifts from its source.

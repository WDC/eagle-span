# Working in this repository

Guidance for Claude Code and any other coding agent. `AGENTS.md` is a symlink to
this file, so there is one copy of it.

`README.md` is the reference — what every gate checks, how the fonts and
redirects are built, how the forms are wired. This file is the shorter thing an
agent needs before it edits: what the project is, what it must not break, and
which file owns each decision.

## What this is

A replacement for the Webflow/Dieselmatic site at `www.eaglespancorp.com` —
Eagle Span Corporation, a heavy-duty truck repair shop in Charlotte, NC.

Astro 5 in `output: 'static'` on Vercel, Bun for tooling, TypeScript in
`astro/tsconfigs/strictest`. Content is Markdoc and YAML under `src/content/`,
edited through Keystatic in local mode. `~/*` maps to `src/*`.

The build is 30-odd pages and **one** serverless function (`/api/contact`).
That is a property, not an accident — see *Invariants* below.

## Commands

```bash
bun install
bun run dev      # http://127.0.0.1:4321 — and /keystatic for the editor
bun run check    # every static gate, in the order CI runs them
```

`bun run check` is the one to run before you say you are done. It is slow
because it builds; the fast inner loop is `bun run typecheck && bun test`.

Individual gates are listed in the README's table. The ones that most often
catch an edit: `verify:content` (a tag with no renderer, an orphaned file),
`verify:jsonld` (NAP drift, a missing `Service` node), `verify:sitemap` and
`verify:metadata` (the page inventory disagreeing with itself),
`lint:typography` (a straight quote or a bare `--` in copy).

Three gates need a deployed origin and are CI-only: `verify:redirects`,
Lighthouse, axe.

## Single sources of truth

Almost every rule in this repo is "there is exactly one place that knows X".
Before adding a constant, check whether one of these already owns it.

| Question | File |
| --- | --- |
| Phone, address, hours, business name, geo | `src/site.config.ts` |
| Where a page lives at a URL | `src/lib/routes.ts` |
| Where content lives on disk | `src/lib/content-paths.ts` |
| Which pages exist, as data | `src/lib/pages.ts` |
| What a content file may contain | `src/content.config.ts` |
| Which Markdoc tags exist | `src/lib/markdoc-tags.ts` |
| What each form asks | `src/lib/forms/fields.ts` |
| Colour, spacing, type scale | `src/styles/tokens.css` |
| The JSON-LD graph | `src/lib/schema.ts` |
| Redirects | `data/redirects.csv` |

A phone number typed into a template, a URL path written out in a component, or
a hex colour in a stylesheet is a bug even when it renders correctly. Several of
these are gated, so it is also usually a red build.

## Generated files — never hand-edit

Each is committed so it shows up in review, and each has a gate that fails when
it drifts from its source.

| File | Regenerate with |
| --- | --- |
| `vercel.json` | `bun run redirects:build` (source: `data/redirects.csv`) |
| `public/fonts/*.woff2`, `src/styles/fonts.css`, `src/lib/fonts.generated.ts`, `data/fonts.json`, `data/og-fonts/` | `bun run fonts:build` (needs `pip install 'fonttools[woff]' brotli`) |

## Invariants

Break one of these and the gate that owns it fails. They are listed because the
failure message explains *what* broke, not why the rule exists.

* **The deployed site is static apart from `/api/contact`.** Keystatic is
  registered for `astro dev` only; no admin UI and no write endpoint on a public
  origin. Adding `export const prerender = false` to a second route breaks it.
  (`verify:static-build`)
* **The NAP is byte-identical everywhere.** The live site emits five phone
  formats and two spellings of the business name; that is the drift this
  replaces. (`verify:jsonld`)
* **A structured-data node describes something visible on its page.** No
  `FAQPage` whose answers are not rendered, no breadcrumb trail the reader
  cannot see. (`verify:jsonld`)
* **The page inventory agrees with itself.** `listSitePages()` feeds the
  sitemap, the OG cards and `/llms.txt`; a page in one and not the others is a
  failure, and so is a `noindex` page in any of them.
  (`verify:sitemap`, `verify:metadata`)
* **Motion is opt-in and the resting state is the final frame.** Everything
  animated sits inside `@media (prefers-reduced-motion: no-preference)`, and
  nothing fills forwards. (`verify:motion`)
* **Text tokens clear AA on every ground they are used on**, including through
  the `.t-deep` remapping. `--c-target`, `--c-amber` and `--c-ink-4` are marks
  and never carry text. (`verify:tokens`)
* **Both forms submit with no JavaScript.** A real `method`/`action`, native
  validation, a 303 to `/contact/thanks`. The `fetch` path is an enhancement.
  (`verify:forms`)
* **Content cannot execute.** Markdoc, not MDX, and only the tags declared in
  `src/lib/markdoc-tags.ts`.

## Writing copy

Body copy runs through `smartypants → nbsp → widont → normalize`. Markdown gets
stages 2–4 from `src/lib/remark-typography.ts`; strings in `.astro` files call
`typo()` from `src/lib/typography.ts`. Write curly quotes, real em dashes and
`×` rather than `x`, or `lint:typography` will say so — 13 rules, all with
fix-it messages.

`seo.title` is bounded at 70 characters **without** the brand suffix;
`BaseLayout` appends `| Eagle Span` once, so never write the brand into a title.

## Known placeholders

Two things are deliberately fake and both say so on the page or in a comment.
Do not treat either as finished work, and do not quietly extend them:

* **Photography.** Every image comes from `src/lib/placeholders.ts` and renders
  under a visible badge, pending the shop shoot. Replacing them is deleting that
  module and following the type errors. Three gates carry a temporary allowance
  for it (the Lighthouse third-party budget, the CI link check, the CSP's
  `img-src`) and all three revert when it goes.
* **The icon.** `src/lib/icon.ts` draws a geometric stand-in — the logo's arc,
  in the site's own tokens — because the real logo is a lockup that is
  illegible at 16px. Replacing it is replacing `MARK` in that file; both icon
  routes and the `<link>` tags derive from it.

`src/site.config.ts` also carries a `staticMap` that is `null` until the asset
exists, and the legal pages were rewritten rather than migrated and have not had
legal review.

## Conventions

* **Comments explain why.** This codebase is heavily commented and the comments
  carry the reasoning — the trade that was made, what the obvious alternative
  costs. Match that. A comment restating the line below it is noise; a file with
  a surprising decision and no comment is the actual defect.
* **Prefer making drift impossible over gating it.** Derive from the one source;
  add a gate only where a derivation is not available.
* **A gate that sits red is a gate everyone learns to ignore.** If a check
  cannot pass yet, make it report *pending* against a real condition, the way
  `verify:redirects` does for destinations the build has not produced.
* `git`: work on the branch you were given, commit in coherent steps, and do not
  open a pull request unless you were asked to.

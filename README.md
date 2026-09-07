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
| `bun run verify:fonts` | woff2 digests, `fonts.css` and preload references, required OpenType features, font budget |
| `bun run verify:tokens` | Text-token contrast (AA on both grounds), reserved use of target green |
| `bun run redirects:build` | Regenerates `vercel.json` from `data/redirects.csv` |
| `bun run build` | Astro build |
| `bun run verify:jsonld` | JSON-LD parses, NAP matches `site.config`, canonical present |
| `bun run verify:redirects <origin>` | One hop, right destination, destination 200 |

`verify:redirects`, Lighthouse and axe need a deployed origin, so CI runs them
against the preview URL once `PREVIEW_URL` is set as a repository variable.

**Setting `PREVIEW_URL` alone is not enough.** The Vercel project has SSO
deployment protection on, scoped `all_except_custom_domains`, so every preview
URL answers `302 → vercel.com/sso-api`. Pointed at a preview deployment, all
three gates would fail on every run and none of the failures would be about this
site — `verify:redirects` reports 0/6 because it follows the login redirect, not
because a redirect is wrong. Either exempt the origin from protection, point
`PREVIEW_URL` at a custom domain, or issue a Protection Bypass for Automation
token and send it as `x-vercel-protection-bypass`.

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

## NAP

`src/site.config.ts` is the only place a phone number, address or set of hours
is written. The old site emitted five phone formats and two spellings of the
business name. `verify:jsonld` fails the build if rendered markup drifts from
that file.

The name spelling is settled: two words, "Eagle Span Corporation", matching the
Google Business Profile. The rest of the NAP is finalized against the live GBP
in Phase 4.

## Layout

```
data/       redirects.csv (redirect map), url-inventory.csv (parity sheet),
            fonts.json (font manifest — generated)
docs/       phase findings
public/
  fonts/    subset woff2 + OFL.txt (generated)
scripts/    build + verification CLIs, and their tests
src/
  lib/      schema graph, text pipeline, remark plugin
  layouts/  BaseLayout
  pages/    routes
  styles/   tokens.css, fonts.css (generated), global.css
```

Generated files are committed so they show up in review, and every one of them
has a CI gate that fails if it drifts from its source.

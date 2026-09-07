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
| `bun run lint:typography` | Straight quotes, `--`, lowercase `x`, missing nbsp before units |
| `bun run redirects:build` | Regenerates `vercel.json` from `data/redirects.csv` |
| `bun run build` | Astro build |
| `bun run verify:jsonld` | JSON-LD parses, NAP matches `site.config`, canonical present |
| `bun run verify:redirects <origin>` | One hop, right destination, destination 200 |

`verify:redirects`, Lighthouse and axe need a deployed origin, so CI runs them
against the preview URL once `PREVIEW_URL` is set as a repository variable.

## How redirects work

`data/redirects.csv` is the source of truth — one row per URL, and the `reason`
column is required. `scripts/build-vercel-json.mjs` generates `vercel.json` from
it and rejects duplicates, self-redirects and chains at build time.

`vercel.json` is committed so redirect changes show up in review. CI runs the
generator with `--check` and fails if it is stale.

Redirects emit an explicit `"statusCode": 301`. Vercel's `"permanent": true`
emits a 308; Google treats the two identically but much of the SEO tooling this
migration will be audited with does not.

## NAP

`src/site.config.ts` is the only place a phone number, address or set of hours
is written. The old site emitted five phone formats and two spellings of the
business name. `verify:jsonld` fails the build if rendered markup drifts from
that file.

Two values in it are still pending confirmation against the Google Business
Profile — see `docs/phase-0-findings.md`.

## Layout

```
data/       redirects.csv (redirect map), url-inventory.csv (parity sheet)
docs/       phase findings
scripts/    build + verification CLIs
src/
  lib/      schema graph
  layouts/  BaseLayout
  pages/    routes
  styles/   tokens.css, global.css
```

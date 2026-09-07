# Phase 2 — design system: tokens, type scale, OpenType pipeline

Direction: **measurement, not diamond plate.** Hairline axes, alignment marks
used as real structure, tabular figures, heavy photography in generous space.
Left-aligned on a measurement rail; no card grid. The tokens landed in Phase 1;
this pass adds the type pipeline, the numeric split, the text pipeline and the
gates that keep all three from decaying quietly.

Everything here is infrastructure. Copy still lands in Phase 3 — the homepage is
still a shell.

## The font

Self-hosted subset of **Source Sans 3** (SIL OFL 1.1), shipped as
`Eagle Span Sans`.

The choice was made on one requirement. The design calls for old-style
proportional figures in prose and lining tabular figures in specs, which means
the family has to actually ship `onum` and `pnum`. Most of the technical
grotesques that would suit "measurement" — Inter, IBM Plex Sans — have neither,
and `font-variant-numeric` **fails silently** when a feature is absent: no
warning, no error, just the wrong figures on every page forever. Source Sans 3
has them, and it is a clean workhorse at text sizes.

| | |
| --- | --- |
| Roman (preloaded) | 63.9 KB, variable `wght` 200–900 |
| Italic (on demand) | 60.0 KB, variable `wght` 200–900 |
| Worst case | 123.9 KB against a 160 KB budget |
| Glyphs | 333 — Latin-1, typographic punctuation, primes, fractions, arrows |

Two variable files beat static cuts here: the scale asks for 400 body and 620
headings, and two static faces come to 81 KB against one variable file at 64 KB.

Only the roman is preloaded. The italic is declared in `fonts.css` and downloads
by itself on the pages that render italic text, which most pages do not.

### The `lnum`/`tnum` trap

Source Sans 3 has **no `lnum` and no `tnum`**, because its default figures are
already lining and tabular — every digit is 497 units wide at wght 400. So

```css
.u-tabular { font-variant-numeric: lining-nums tabular-nums; }
```

works by *overriding* the old-style value inherited from `body`, not by
requesting a feature. That is a real dependency on this specific font. Swap in a
face whose defaults are proportional and every spec column silently stops
aligning, with nothing to see in the diff.

`scripts/verify-fonts.mjs` asserts it, and `global.css` says so at the rule.

The stylesheet deliberately does **not** carry
`font-feature-settings: 'tnum' 1, 'lnum' 1` as a belt-and-braces line. Those
features do not exist in this font, so the declaration would be a lie left in
the source for the next person to trust.

### Metric-adjusted fallbacks

Four zero-byte `@font-face` blocks re-describe fonts already on the reader's
machine with our metrics, so the `font-display: swap` moves no text:

| Family | Stands in for | `size-adjust` |
| --- | --- | --- |
| `Eagle Span Sans Fallback` | Arial, Helvetica Neue, Liberation Sans | 94.834% / 92.546% italic |
| `Eagle Span Sans Fallback Roboto` | Roboto — Android's system-ui | 94.274% / 94.692% italic |

`size-adjust` is the ratio of frequency-weighted average advance widths, and
`ascent-override` / `descent-override` are the webfont's own metrics divided by
that ratio. Arial's widths were measured from Liberation Sans, which is drawn to
them on purpose; Roboto's from the Google Fonts latin subset.

Without these the swap reflows every line on first paint and blows the 0.05 CLS
budget on its own.

### Regenerating

```bash
pip install 'fonttools[woff]' brotli
bun run fonts:build      # python3 scripts/build-fonts.py
```

The upstream TTFs are pinned by sha256 and cached in `.cache/` (gitignored).
The script writes five committed artefacts: the two woff2 files, `OFL.txt`,
`src/styles/fonts.css`, `src/lib/fonts.generated.ts` and `data/fonts.json`.

Filenames carry a content hash, which is what makes the existing
`/fonts/(.*) → immutable` cache header in `vercel.json` honest rather than a
footgun.

`bun run verify:fonts` is the CI gate rather than a regenerate-and-diff, because
woff2 compression is not byte-reproducible across fontTools versions: rebuilding
in CI would fail on a dependency bump instead of on a real problem. It checks the
digests, that `fonts.css` and the preload module point at the files that exist,
that the required features survived subsetting, that the fallback order in
`--f-sans` is right, and that the total is inside the budget.

## The numeric split

| Context | Value | Where |
| --- | --- | --- |
| Prose | `oldstyle-nums proportional-nums` | `body` |
| Specs, hours, phone, postal code | `lining-nums tabular-nums` | `.u-tabular` |
| Readings, in-spec indicators | as above, in target green | `.u-reading` |
| Rail labels | lining tabular, `case` punctuation | `.u-label` |
| A fraction | `diagonal-fractions` | `.u-frac`, on the fraction itself |

Old-style figures sit on the x-height and read as words, which is what a
sentence containing a year wants. Lining tabular figures align down a column and
read as data, which is what a spec sheet wants. Same font, two declarations.

### Correction: `diagonal-fractions` is a run, not a block

The first three rows above originally carried `diagonal-fractions` as well, on
the reasoning that a spec column is where ⁷⁄₁₆ shows up. That was wrong, and
visibly so: **it raised every full stop and comma on the site to numerator
height.**

`frac` in Source Sans 3 is three lookups, and only the last is the contextual
rule that assembles a fraction around the slash. The first two are unconditional
single substitutions — `period → period.n`, `comma → comma.n`, and every digit
to its numerator form. The feature is built to be switched on for the fraction
and off again; applied to `body` it applies to the whole paragraph. Subsetting
had nothing to do with it — the upstream variable font has the same three
lookups.

Nothing caught it because Phase 2 shipped onto a one-page shell and Phase 1's
prose was two sentences. Phase 4 put real copy on thirteen pages, which is when
someone read one. `.u-frac` is now the only rule allowed to set it, and
`verify:fonts` fails if the declaration appears anywhere else in `src/` —
comments stripped, component `<style>` blocks included.

The phone number gets `.u-nowrap` rather than an injected non-breaking space:
the NAP has to stay byte-identical to the Google Business Profile, and a U+00A0
in the markup would make it differ from `site.config.ts` and from the JSON-LD.

## Colour

Alignment-target green is now **two** tokens, because the sampled green is
3.37:1 on white — fine as a mark, a WCAG AA failure the moment it is text.

* `--c-target` `#12a150` — indicators, rules, in-spec ticks. Never a `color:`.
* `--c-target-ink` `#0c7a3c` — the same green at 5.43:1 on `--c-ground` and
  4.93:1 on `--c-ground-2`. The only one allowed to carry text.

`scripts/verify-tokens.mjs` checks every text token against both grounds and
fails on `color: var(--c-target)`. It exists because the axe job only runs once
`PREVIEW_URL` is set, and a contrast failure baked into a token is much cheaper
to catch before fourteen service pages use it.

`--c-ink-4` is annotated `NOT text` for the same reason (3.31:1).

## The text pipeline

`smartypants → nbsp → widont → normalization`, in `src/lib/typography.ts`.

Two entry points, one implementation:

* **Markdown** gets stages 2–4 from `src/lib/remark-typography.ts`. Astro
  registers `remark-smartypants` ahead of every user plugin, so stage 1 is
  already applied when the plugin sees the tree — which is exactly the order
  the stages need to run in.
* **`.astro` copy and frontmatter** call `typo()`, which runs all four. These
  strings never touch markdown and would otherwise be the one place on the site
  where a straight quote reaches the page.

Stage notes:

* **nbsp** binds a figure to its unit, closes a figure up against `°` `′` `″`
  `%`, spaces out dimensions as `24 × 8.25`, and binds a reference to its number
  (`Class 8`, `Interstate 85`). The unit list is shared with the lint so the
  gate and the fix cannot disagree about what a unit is.
* **widont** is deliberately conservative: it skips blocks under three words and
  final words over twelve characters, because a non-breaking space is a hard
  constraint that can force horizontal overflow, which is worse than an orphan.
  `text-wrap: pretty` and `balance` are already set and do this better; widont
  is the fallback for browsers that have neither.
* **normalization** will not touch a bare `24"`. After smartypants it is
  indistinguishable from a closing quote on a sentence that ends in a figure,
  and guessing wrong is worse than not acting. The lint owns that case instead.

### Why both a lint and a pipeline

They are not redundant:

* The pipeline fixes the **rendered page**. It cannot fix copy once it leaves
  this repo — a meta description pasted into a spreadsheet, a GBP post, a
  heading someone copies off the page.
* The lint fixes the **source**, so what a writer typed is what ships. A build
  step that quietly repairs straight quotes trains everyone to stop caring.

`scripts/lint-typography.mjs` grew from 8 rules to 13: added `ascii-double-prime`,
`hyphen-range` (hours are NAP content and appear on every page),
`ascii-multiplication-symbol`, `ascii-trademark` and `double-space`, and it now
reports every occurrence on a line rather than the first.

`scripts/lint-typography.test.mjs` runs every rule against a violation and
against its corrected form, and asserts the rule set and the case list stay in
step. The second half is the important half: a typography lint that fires on
correct copy gets switched off within a week, so each rule also has to prove it
stays quiet on clean prose, on the phone number, on the postal code and on
markup.

## Business name

Resolved (ClickUp 86bbw0ecw): **two words, "Eagle Span Corporation"**, matching
the Google Business Profile. The Webflow site's one-word "EagleSpan Corporation"
was the drift, not the listing.

`src/site.config.ts` was the one-line change; `verify:jsonld` already fails the
build on drift between it and the rendered markup. Page titles now compose from
`site.name` and `site.shortName` rather than restating the name, so it cannot
come apart again.

The rest of Phase 4's NAP finalization against the live GBP is untouched.

## Gates added

| Command | Gate |
| --- | --- |
| `bun test` | The text pipeline, the remark plugin and every lint rule |
| `bun run verify:fonts` | woff2 digests, CSS/preload references, required OpenType features, fallback order, font budget |
| `bun run verify:tokens` | Text-token contrast on both grounds, reserved use of target green |

All three are in `bun run check` and in the CI `gates` job.

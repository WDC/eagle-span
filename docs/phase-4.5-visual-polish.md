# Phase 4.5 — colour, depth and the interface layer

Not a phase anybody planned. The board runs 0 → 8 and none of them is a design
pass: Phase 2 built the design system, Phase 3 wrote the copy, Phase 4 built the
templates, and Phase 6 is QA — it proves contrast passes, not that the page has
any presence. So the site arrived at thirteen finished pages that were correct,
fast, accessible and completely flat.

This is the pass that fixes that, and it is written down because most of it
changes decisions Phase 2 made deliberately.

## What was actually wrong

Two things, and only one of them was a mistake.

**The palette was doing its job.** Four inks, three near-white grounds,
hairlines, and green reserved as an alignment mark. Read as a specification it
is a good one. Rendered, it meant a service, a customer quote, a safety warning
and a paragraph of prose were typographically identical — the reader had no way
to tell a thing they could act on from a thing they could only read, and no
edge anywhere to hang orientation on. Restraint stops being restraint when
there is nothing left to be restrained about.

**Every photograph was missing.** The direction has always been "heavy
photography in generous space". `hero`/`heroAlt` are wired into every template,
the homepage hero image is built to *replace* the thrust-angle diagram, and no
entry has one, because the Webflow asset export (ClickUp 86bbw07c4) and the shop
shoot (86bbw07ex) are both still open. The site has been rendering a design with
its main visual ingredient absent, and nothing in the build said so.

The second one is why the first one looked worse than it was.

## What changed

### Bands

The page is built from full-bleed bands rather than one white column. Each band
is a change of ground, which is what gives a reader somewhere to stop:

| Ground | What it carries |
| --- | --- |
| `--c-ground` | Reading. Prose, article bodies, the hero. |
| `--c-ground-2` | Indexes and lists — the repairs catalogue, related entries, the note under an index. |
| `--c-wash-blue` | Anything advisory: the quotes band, a callout. |
| `.t-deep` | Two moments per page at most: the shop's own numbers, and the closing action. Plus the footer. |

### The inverted theme

`.t-deep` is a dark band, and it works by **remapping the ground and ink tokens**
rather than by restyling anything. `EntryList`, `Faqs`, `LocationCard` and every
component rule reads `--c-ink-2` and `--c-rule` rather than a literal colour, so
a component dropped inside a band inverts without knowing the band exists.
Nothing has a dark variant to keep in sync.

The accents are redrawn rather than reused: `--c-target-ink` is 3.41:1 on
`--c-deep`, so the dark band gets `--c-target-on-deep`, `--c-blue-on-deep`,
`--c-red-on-deep` and `--c-amber-on-deep`. `verify:tokens` parses the `.t-deep`
block, resolves the mapping and runs the same AA check through it — a remap
pointed at the wrong token, or an ink left unmapped, fails the build.

### Panels

Phase 2's rule was "nothing on this site sits in a bordered box". The rule is
narrower now rather than abandoned: a panel means **this is a discrete object** —
one service, one quote, one advisory, one action. Prose is never in one, and an
index row is still a rule rather than a card, which is why the homepage has a
card grid of five featured services and the `/service` index does not.

### Callouts

A callout was a hairline and a label. In prose that was too quiet to work: a
safety warning that looks like a block quote is a safety warning nobody reads,
and on a page about air brakes that is the paragraph that must not be missed.

It is a panel now, and the tone is carried three ways over — the label, the
weight and colour of the axis, and the wash — because each one fails somewhere.
The wash is gone in print and in forced colours, the colour is gone for a reader
who cannot distinguish it, and the label survives everything. Caution finally
has its own colour (`--c-amber`, `--c-amber-ink`) instead of borrowing red from
safety.

### The FAQ is a disclosure now

This reverses a Phase 4 decision, so the reasoning is worth keeping.

Phase 4 rendered every answer open, on the reading that a collapsed
`acceptedAnswer` is the structured-data violation Google actions manually. That
is half right. The rule is that the answer must be **present on the page and
reachable by the reader** — Google's own documentation permits an expandable
section and its examples use one. What it forbids is an answer that exists only
in the markup, or that arrives from a fetch after the click.

`Faqs.astro` is a `<details>`: the text is in the HTML on first byte, it is
found by in-page search, it is announced by a screen reader, each question is a
real `<h3>` in the page outline, and `verify:jsonld` matches every rendered
answer against the graph exactly as it did before — the gate did not change and
it still passes. The `name` attribute makes the group exclusive, which is the
browser's own accordion behaviour and needs no script.

Thirty-five questions rendered open was four screens of prose nobody read past
the second one.

### The masthead sticks

A truck is down and the number has to be one thumb-reach away at any scroll
depth. Three parts:

* **Sticky**, with a translucent ground behind a `backdrop-filter` and a solid
  fallback, because a translucent bar without the blur is an unreadable bar.
* **A `<details>` menu below 64rem.** Five links, a number and a button reflowed
  into four rows on a phone, which is how the original screenshot ended up with a
  masthead taller than the hero. The browser owns the open state, the keyboard
  behaviour and the semantics; the script budget does not move.
* **A shadow that arrives on scroll**, on a `scroll()` timeline rather than a
  listener.

And below 48rem there is a fixed action bar carrying the number and the one
action, because somebody reading about air-brake failure at the side of a road
is not going to scroll back up.

### Motion

Everything added is the same construction Phase 2 established, and
`verify:motion` enforces it unchanged: every animation sits inside
`@media (prefers-reduced-motion: no-preference)`, and nothing time-driven fills
forwards.

| What | Timeline | Resting state |
| --- | --- | --- |
| Section and item reveals | `view()` | Visible, unmoved |
| Masthead shadow | `scroll(root block)` | Hairline, no shadow |
| Article reading progress | `scroll(root block)` | `display: none` — no bar at all |
| Hover: panel lift, arrow slide, image scale, accordion mark | transition | The resting value itself |

The hover states are transitions rather than animations on purpose: they run
from and to real values, so there is nothing to hold and nothing to restore, and
the duration tokens already collapse to 1ms under reduced motion.

The reading progress bar is the one worth noting. Its resting state is
`display: none`, and it is rendered only where the scroll timeline exists — a
progress bar that cannot progress is a green line across somebody's screen.

Script on the site is unchanged at **5.8 KB gzipped** against a 50 KB budget.
None of this is JavaScript.

## The placeholders, which are temporary

Every image slot on the site now holds a seeded photograph from
`picsum.photos`, through `src/lib/placeholders.ts`, under a visible
**Placeholder** badge.

Three decisions:

1. **Seeded per slot**, so a page does not shuffle its own art between builds and
   a review comment about "the third image" still means something tomorrow. The
   seed names the slot (`home-shop-bays`), not the picture.
2. **Obviously not the shop.** A stock photograph of a truck would be a lie the
   client could launch with by accident. An unrelated photograph under a badge
   cannot be mistaken for the real thing by anybody.
3. **Alt text describes the slot**, not the picture: `Placeholder — the seven-bay
   shop floor…`. Saying it is the shop floor would be a lie told specifically to
   the reader who cannot see it. It is also the note to whoever replaces the
   image that the alt text has to be rewritten with the real photograph.

Two gates know about them, and **both revert when the photography lands**:

* `lighthouse-budget.json` carries a third-party request allowance of 24. **The
  design number is 0**, and it goes back to 0 with the real assets.
* The CI link check skips the CDN, because every page carries several and a run
  would fail on a rate limiter rather than on a broken link.

Replacing them is deleting `src/lib/placeholders.ts` and following the type
errors. That is the whole of the cleanup, and it is deliberately that shape.

## What this does not do

* **It does not touch the content model.** No schema changed, no Keystatic field
  moved, and no copy was rewritten. The one new string on the site is the
  closing band's heading.
* **It does not invent claims.** Everything on the page is content that already
  existed or a fact read from `site.config.ts`. The design got louder; the
  business did not acquire any new capabilities.
* **It does not add a script.** Every interaction is CSS or a native element.
* **It does not fix the logo.** Phase 2 noted no logo cleanup this pass; that is
  still true, and it is now the least modern thing on the page.

## What Phase 6 inherits

* **The third-party budget is a live gate, not a decoration.** If the shoot has
  not happened by QA, Phase 6 is looking at a Lighthouse run with 24 allowed
  third-party requests and a site whose photographs are of a bridge in San
  Francisco. That is the alarm working.
* **axe has more to audit.** The dark band, the disclosure menu, the accordion
  and the sticky action bar are all new surfaces. Token contrast is gated in
  both directions; rendered contrast, focus order in the open menu, and the
  `<details>` semantics are for the axe run against a real origin.
* **The masthead is sticky, which changes anchor behaviour.** Every heading and
  section with an `id` carries `scroll-margin-block-start`; a fragment link that
  lands under the bar is a bug and it is one Phase 6 would catch.

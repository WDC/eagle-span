# Phase 2 — motion: one hero animation, and restraint everywhere else

Scope cut per client direction: **one** custom SVG piece, not eight. What
shipped is the home hero thrust-angle diagram, cross-document view transitions
on offering titles, and scroll-driven section reveals. Nothing else.

The deferred concepts are at the bottom of this file rather than deleted. They
were cut for time, not because they were wrong.

## The hero: thrust angle

`src/components/ThrustAngle.astro`. Top-down axle set. The drive axle sits
2.40° out of square against the geometric centerline, the measurement scale
sweeps in, the thrust line extends from the axle it measures, and the geometry
resolves as the readout counts to 0.00° and the in-spec mark settles.

It says the three things the homepage has to say — the specialty, the precision,
the outcome — in one gesture, with no copy.

### The angle is real

2.40° of thrust is a truck that dog-tracks and eats the outside of its drive
tyres. It is also, drawn to scale, a deviation of about four units across a
208-unit axle: small enough that the diagram is nearly square at its worst.

That is the argument, not a compromise. The deviation this shop is paid to find
is not one anybody sees by eye, and a diagram that exaggerated it into something
obvious would be making the opposite case. Motion is what makes four units
legible — the eye reads the change, not the offset.

The wedge between the dashed square reference and the rotating axle is drawn
once at the starting angle and faded out as the rotation resolves. It is exact
at the frame that matters and empty at the frame that matters, and an
approximate area in between, which is the right trade for a shape that exists to
be watched closing.

### Two rules, and a gate

Everything about this piece follows from two rules, and `verify:motion` enforces
both because both are invisible when broken — the page still renders, it just
renders a moment of an animation, or animates at somebody who asked it not to.

**1. The resting state is the final frame.** The markup and the unanimated CSS
render the aligned truck, the full scale and 0.00° — the thing that is true.
Every animation runs *from* a disturbed state back to the element's own resting
value, and every `@keyframes` block omits its `to` for exactly that reason: the
end value is whatever the element already has, so the animation cannot disagree
with the page.

So nothing fills forwards. `backwards` is used freely — it holds the *from*
state through a delay — but a `forwards` fill would mean the truth is a state
only the animation can reach, and a reader with reduced motion, a browser that
never ran it, a print stylesheet and a failed request would all get something
else. The gate fails on `forwards` and `both`, with one exception below.

**2. Motion is opt-in.** Every animation sits inside
`@media (prefers-reduced-motion: no-preference)`. Not a `reduce` override: a
browser that does not know the feature matches neither query, and the version it
should get in that case is the still one. Tokens also collapse `--d-draw` and
the transition durations under `reduce`, which covers the hover transitions that
are not animations; the two mechanisms overlap on purpose.

### The readout is an odometer

The count is a column of thirteen real text nodes stepped past a one-line
window by `steps(12, end)`. No `@property`, no `round()`, no CSS counters, no
script.

The reason is rule 1. The column **rests translated to its last stop**, so the
number on a page that never animates is the number the animation ends on. Every
other technique for animating a decimal — a registered custom property
interpolated into a counter, a script writing `textContent` — has a resting
state that is either the starting value or nothing at all.

The stops and the angle the drawing starts at come from one constant, so the
first stop and the first frame cannot drift apart:

```ts
const START_ANGLE = 2.4;
const STEPS = 12;
const stops = Array.from({ length: STEPS + 1 }, (_, i) => (START_ANGLE * (1 - i / STEPS)).toFixed(2));
```

The column is `aria-hidden`, because a screen reader walking it would announce
all thirteen readings. The one true value sits beside it in a visually hidden
span, and `verify:motion` checks the built homepage for both — the last stop
being `0.00°`, and an announced `0.00°` that is not the odometer.

### The resolve is linear, and that is deliberate

`steps()` cannot be composed with an easing function, so the readout steps on
linear progress. The rotation and the wedge were originally eased with
`--e-inout`, and the result was measurably wrong: at 1400 ms the axle was 0.73°
out while the readout still said 1.20°. The eye reads the axle, the number
contradicts it, and the whole conceit — that the number is measuring the
drawing — falls over.

So the resolve, the deviation and the count share a window **and** a timing
function. A machine converging on a reading does not ease out anyway.

Measured on the built page, freezing every `ta-*` animation on the shared
2200 ms timeline:

| t | drawn | scale | axle | readout | in spec |
| --- | --- | --- | --- | --- | --- |
| 0 ms | 0 | 0 | 2.40° | 2.40° | — |
| 400 ms | 0.92 | 0.94 | 2.40° | 2.40° | — |
| 900 ms | 1 | 1 | 2.01° | 2.20° | — |
| 1400 ms | 1 | 1 | 1.02° | 1.20° | — |
| 1900 ms | 1 | 1 | 0.03° | 0.20° | — |
| 2200 ms | 1 | 1 | 0.00° | 0.00° | shown |

The readout leads the axle by at most one stop. That is inherent to a stepped
odometer — it holds the value at the start of each interval — and 0.20° is well
under what the drawing can show.

### Transforms, not dashes

The thrust line originally drew itself in with `stroke-dasharray` on a
`pathLength="1"` line, and drew from the wrong end. `stroke-dasharray` wants a
length, `pathLength` redefines what a length is, and `non-scaling-stroke`
redefines it again; between the three, what a dash unit meant was not something
worth reasoning about. It is a `scaleY` from the axle end now, which has one
meaning, composites, and rests at `1` without being told to.

The measurement scale sweeps in the same way: a `clipPath` rect scaled on X,
whose own attributes already describe the finished state. A browser that applies
neither transform shows the whole scale.

### Where it renders

The hero visual, and a hero image **replaces** it rather than stacking under it
— two competing visuals is not a hero. The Keystatic field for the homepage hero
image says so, because setting a photograph there is how the one piece of motion
on the site would otherwise disappear without anyone deciding to remove it.
Phase 3 lands real shop photography and that is the decision to revisit.

## View transitions

`<ClientRouter fallback="none" />` in `BaseLayout`, and `transition:name` on two
elements: the title of a row in `EntryList`, and the H1 of the page it links to.
Click a service in an index and the heading carries across the navigation
instead of the document cross-fading under it.

`fallback="none"` is the restraint. Astro's default reproduces the effect in
script on browsers without native view transitions, which is a JavaScript-driven
animation of a page load on a site whose whole argument is that it does not need
one. Browsers with the feature get it; browsers without navigate the way they
always did. The router costs 4.6 KB gzipped against a 50 KB script budget.

Names come from `transitionName()` in `src/lib/routes.ts` — a URL path is not a
CSS custom-ident, and the `t-` prefix settles the leading slash, the inner
slashes and a leading digit at once. Both ends derive from that one function
because a name that agrees by coincidence is a name that stops agreeing, and
`verify:motion` fails if either side stops calling it.

Three things had to be fixed to make it actually work:

* **A directive is not an attribute.** `transition:name` written literally on an
  element compiles to a scope class and a `view-transition-name` rule; passed
  through a spread or a prop it survives into the HTML as a literal
  `transition:name="…"` attribute that nothing reads. Both pages render
  correctly and the morph simply never happens. `PageHeader` therefore branches
  on `path` rather than spreading, and the gate greps the **built output** for
  that string, because it is invisible everywhere else.
* **An entry that lists itself** would put the same name on a related-entry row
  and on the page's own H1. A duplicate `view-transition-name` makes the browser
  skip the transition entirely, so `OfferingPage` filters self-references out of
  `related`. It was always a content bug; now it is a rendering one too.
* **`prefers-reduced-motion` is handled in `global.css`**, not left to the
  browser. The default cross-fade is an animation the reader did not ask for and
  `ClientRouter` has no say over it. Cutting the animation does not cancel the
  transition — the new page still swaps in, it just does so at once.

Audited across the whole build: every row name has a page carrying it, every
page name has a row linking it, and no page carries a duplicate.

## Scroll reveals

`.u-reveal` on the homepage sections below the hero. A native scroll timeline —
`animation-timeline: view()` — with no observer, no script and no class toggled
on scroll.

That is what makes it safe to use at all. The failure mode of the JavaScript
version is content that never appears, and it fails exactly where it is least
visible: a slow connection, a blocked bundle, a reader who scrolled before
hydration. Here the element is visible in its own right and the animation is
added only where the feature is supported *and* the reader has not asked for
less motion.

This is the one place a `both` fill is correct, and the gate allows it only in a
rule that sets `animation-timeline`: on a scroll timeline the fill holds the
state for the range beyond the animation rather than freezing a moment in time,
so a section stays revealed once it has been.

The hero does not take it. It is on screen at load, where a reveal is either
invisible or a delay on the first thing anybody reads.

## Gates added

| Command | Gate |
| --- | --- |
| `bun run verify:motion` | Every animation behind `prefers-reduced-motion: no-preference`; no forwards fill on a time-driven animation; both ends of the title morph derive from `transitionName()`; no literal `transition:name` in source or in the build; `ClientRouter` present; the built homepage rests at 0.00° |

`scripts/verify-motion.test.mjs` runs the CSS scanner against each violation and
against its corrected form. The second half is the important half, as with the
typography lint: the gate has to stay quiet on a `backwards` fill, on
`animation: none` inside a `reduce` block, and on the one scroll-driven rule
that legitimately fills.

One rule in the typography lint changed with it. `<h1 {...morph}>` is a spread,
not an ellipsis, and `isCode` could not see it — a spread carries no `=` and no
import keyword, so it read as prose.

## Deferred — parked, not cancelled

In the priority order the scope cut set, if the budget reopens:

1. **Toe, camber and caster diagrams** on `/repairs/wheel-alignment`. Three small
   pieces on one page, each a single measured angle. The closest to shipping:
   they reuse the axle set, the scale and the readout from the hero, and the page
   is the one most likely to earn links on the strength of the diagrams alone.
2. **Tire wear patterns** on `/repairs/tire-repair`. Diagnostic content — feather,
   cup, shoulder, centre — that answers a question people search for, which is
   why it outranks the rest of this list despite being the least animated.
3. **DOT checklist sweep.** An inspection sheet filling in, for `/services`.
4. **Air brake circuit.** Charge and release through a two-line system.
5. **Driveline angle.** Working angle at the U-joints, the same measured-deviation
   idea as the hero applied to a different plane.
6. **Suspension under load.** Spring and axle travel, top-down being the wrong
   view for it.
7. **The seven-bay motif.** A structural mark rather than a diagram, for section
   openers.

Anything from this list inherits the two rules and the gate. The parts worth
reusing are `ThrustAngle.astro`'s odometer, the sweep clip and the shape of the
`@media (prefers-reduced-motion: no-preference)` block; the parts to avoid are
in **Transforms, not dashes** above.

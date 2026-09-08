#!/usr/bin/env node
/**
 * Motion stays optional, and the resting state stays true.
 *
 * Phase 2 ships one custom animation and two pieces of restraint, and all three
 * rest on the same two rules. Both are invisible when broken — the page still
 * renders, it just renders a moment of an animation, or animates at somebody
 * who asked it not to — so both are gates.
 *
 *   1. **Motion is opt-in.** Every `animation` that names something sits inside
 *      `@media (prefers-reduced-motion: no-preference)`. Not a `reduce`
 *      override: a browser that does not know the feature matches neither
 *      query, and the version it should get is the still one. `animation: none`
 *      is exempt — that is the absence of motion, not motion.
 *
 *   2. **The resting state is the final frame.** Every animation on this site
 *      runs *from* a disturbed state back to the element's own resting value,
 *      so none of them needs `forwards` fill — and any that took it would be
 *      declaring that the truth is a state only the animation can reach. A
 *      reader with reduced motion, a browser that never ran it and a printed
 *      page would all get something else.
 *
 *      Scroll-driven animations are the exception, and the only one: on a view
 *      timeline the fill holds the state for the range beyond the animation
 *      rather than freezing a moment in time. So a forwards or `both` fill is
 *      allowed exactly where the same rule sets `animation-timeline`.
 *
 * Then three structural checks, because a title morph is four things in three
 * files and any one of them going missing takes it out silently:
 *
 *   3. `EntryList` and `PageHeader` both derive `transition:name` from
 *      `transitionName()` in src/lib/routes.ts, and nothing hardcodes one.
 *   4. `BaseLayout` renders `<ClientRouter />`, without which every
 *      `transition:name` on the site is inert.
 *   5. The built homepage's readout rests on 0.00° — the last stop of the
 *      odometer column and the one value that is not decoration. This is the
 *      end-to-end form of rule 2: whatever the diagram animates, what a reader
 *      who never sees it animate is told is that the truck is in spec.
 *
 * Run after `bun run build`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, relative, resolve } from 'node:path';

import { staticRoot } from './lib/dist.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Comments explain a rule; they are not the rule. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The `<style>` blocks of an .astro file, or the whole of a .css one. */
export function cssOf(source, ext) {
  if (ext !== '.astro') return source;
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
}

const GUARD = /prefers-reduced-motion\s*:\s*no-preference/;
/** `backwards` must not read as `forwards` — the word boundary is load-bearing. */
const HOLDS_FORWARD = /(?:^|\s|,)(?:forwards|both)(?:\s|,|$)/;

/**
 * Walk the CSS tracking the at-rule stack, and report every place the two rules
 * above are broken. Exported so scripts/verify-motion.test.mjs can drive it
 * with the shapes that matter rather than with the whole stylesheet.
 *
 * A hand-rolled walk rather than a parser dependency: it needs brace depth, the
 * prelude of each open block and the declarations inside it, and that is the
 * whole of it.
 */
export function scanCss(css) {
  const problems = [];
  const stack = [];
  let buffer = '';
  let line = 1;

  const guarded = () => stack.some((frame) => GUARD.test(frame.prelude));

  for (const ch of stripComments(css)) {
    if (ch === '\n') line += 1;

    if (ch === '{') {
      stack.push({ prelude: buffer.trim(), decls: [], line });
      buffer = '';
      continue;
    }

    if (ch === '}' || ch === ';') {
      const text = buffer.trim();
      buffer = '';

      if (ch === ';' && text) {
        const [rawProp, ...rest] = text.split(':');
        const prop = rawProp.trim().toLowerCase();
        const value = rest.join(':').trim().toLowerCase();
        stack.at(-1)?.decls.push({ prop, value, line });

        if ((prop === 'animation' || prop === 'animation-name') && value !== 'none' && !guarded()) {
          problems.push({
            line,
            message:
              `\`${prop}: ${value}\` is not inside ` +
              '@media (prefers-reduced-motion: no-preference) — motion has to be opt-in',
          });
        }
        continue;
      }

      const frame = stack.pop();
      if (!frame) continue;

      const fills = frame.decls.filter(
        (d) =>
          (d.prop === 'animation' || d.prop === 'animation-fill-mode') && HOLDS_FORWARD.test(` ${d.value} `),
      );
      const scrollDriven = frame.decls.some((d) => d.prop === 'animation-timeline');

      if (fills.length && !scrollDriven) {
        for (const decl of fills) {
          problems.push({
            line: decl.line,
            message:
              `\`${decl.prop}: ${decl.value}\` fills forwards on a time-driven animation — ` +
              'the resting state has to be the final frame, so the animation must end on it ' +
              'rather than hold it (a scroll-driven rule setting animation-timeline may fill)',
          });
        }
      }
    }

    if (ch !== '}' && ch !== ';') buffer += ch;
  }

  return problems;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.css', '.astro'].includes(extname(p))) out.push(p);
  }
  return out;
}

function walkHtml(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) walkHtml(p, out);
    else if (extname(p) === '.html') out.push(p);
  }
  return out;
}

function main() {
  let failures = 0;
  const fail = (msg) => { failures += 1; console.error(`FAIL ${msg}`); };

  /* ---- 1 and 2: the CSS ----------------------------------------------- */

  const sources = walk(resolve(root, 'src'));
  let animations = 0;

  for (const file of sources) {
    const css = cssOf(readFileSync(file, 'utf8'), extname(file));
    if (!css.trim()) continue;

    animations += (stripComments(css).match(/(?:^|[;{\s])animation\s*:/g) ?? []).length;
    for (const { line, message } of scanCss(css)) fail(`${relative(root, file)}:${line}: ${message}`);
  }

  /* ---- 3 and 4: the title morph --------------------------------------- */

  const read = (p) => readFileSync(resolve(root, p), 'utf8');

  for (const file of ['src/components/EntryList.astro', 'src/components/PageHeader.astro']) {
    const source = read(file);
    if (!/import \{ transitionName \} from '~\/lib\/routes\.ts'/.test(source)) {
      fail(`${file} does not import transitionName from src/lib/routes.ts — the two ends of the morph have to agree`);
    }
    if (!/transition:name/.test(source) || !/transitionName\(/.test(source)) {
      fail(`${file} does not derive its transition:name from transitionName()`);
    }
  }

  for (const file of sources) {
    // Comments explain the rule; a comment quoting the bad form is not the bad form.
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const m of source.matchAll(/transition:name=("|')/g)) {
      const line = source.slice(0, m.index).split('\n').length;
      fail(
        `${relative(root, file)}:${line}: a literal transition:name — it has to come from ` +
        'transitionName() or the two halves drift apart',
      );
    }
  }

  if (!/<ClientRouter\b/.test(read('src/layouts/BaseLayout.astro'))) {
    fail('BaseLayout does not render <ClientRouter /> — every transition:name on the site would be inert');
  }

  /* ---- 5: the built homepage rests in spec ----------------------------- */

  const home = resolve(staticRoot(root), 'index.html');
  if (!existsSync(home)) {
    console.error('dist/index.html is missing. Run `bun run build` first.');
    process.exit(1);
  }

  /*
   * A directive that became an attribute. `transition:name` written literally
   * compiles to a scope class and a `view-transition-name` rule; passed through
   * a spread or an object it survives into the HTML as a literal
   * `transition:name="…"` attribute, which nothing reads. Both pages render
   * correctly and the morph just never happens, so the built output is the only
   * place it shows.
   */
  for (const page of walkHtml(staticRoot(root))) {
    const source = readFileSync(page, 'utf8');
    if (/\stransition:name=/.test(source)) {
      fail(
        `${relative(root, page)}: a literal transition:name attribute reached the build — ` +
        'the directive was spread or passed as a prop rather than written on the element, ' +
        'so the browser never sees a view-transition-name',
      );
    }
    if (/view-transition-name/.test(source) && !/data-astro-transition-scope/.test(source)) {
      fail(`${relative(root, page)}: a view-transition-name with no transition scope on any element`);
    }
  }

  const html = readFileSync(home, 'utf8');
  const stops = [...html.matchAll(/<span class="[^"]*\bta__stop\b[^"]*"[^>]*>([^<]+)<\/span>/g)].map((m) =>
    m[1].trim(),
  );

  if (stops.length === 0) {
    fail('dist/index.html carries no thrust-angle readout — the hero diagram did not render');
  } else if (stops.at(-1) !== '0.00°') {
    fail(
      `the readout column rests on ${stops.at(-1)} rather than 0.00° — a reader who never sees ` +
      'the animation is being shown a truck that is out of spec',
    );
  }

  if (!/<span class="[^"]*\bu-visually-hidden\b[^"]*"[^>]*>0\.00°</.test(html)) {
    fail('dist/index.html has no announced thrust-angle reading — the odometer is decoration and cannot stand in for one');
  }

  console.log(
    `\nmotion: ${sources.length} stylesheets, ${animations} animation declarations, ` +
    `${stops.length} readout stops, ${failures} problem${failures === 1 ? '' : 's'}.`,
  );
  return failures;
}

// Importable for the tests; still a CLI when run directly.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (main()) process.exit(1);
}

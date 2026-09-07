/**
 * The motion gate, against the shapes it exists to catch.
 *
 * Same principle as the typography lint's tests: each rule is run against a
 * violation *and* against its corrected form. The second half is the important
 * half — a gate that fires on correct CSS is a gate somebody switches off, and
 * this one has to stay quiet on a `backwards` fill, on `animation: none` in a
 * `reduce` block and on the one scroll-driven rule that legitimately fills.
 */
import { describe, expect, test } from 'bun:test';

import { cssOf, scanCss } from './verify-motion.mjs';

const guarded = (body) => `@media (prefers-reduced-motion: no-preference) { ${body} }`;

describe('motion is opt-in', () => {
  test('an unguarded animation fails', () => {
    const [problem, ...rest] = scanCss('.hero { animation: draw 2s ease; }');
    expect(problem.message).toContain('no-preference');
    expect(rest).toHaveLength(0);
  });

  test('the same rule inside the guard passes', () => {
    expect(scanCss(guarded('.hero { animation: draw 2s ease; }'))).toEqual([]);
  });

  test('a `reduce` block is not a guard — it is the wrong way round', () => {
    const css = '@media (prefers-reduced-motion: reduce) { .hero { animation: draw 2s; } }';
    expect(scanCss(css)).toHaveLength(1);
  });

  test('animation-name is caught too', () => {
    expect(scanCss('.hero { animation-name: draw; }')).toHaveLength(1);
  });

  test('`animation: none` is the absence of motion, not motion', () => {
    const css = '@media (prefers-reduced-motion: reduce) { ::view-transition-group(*) { animation: none; } }';
    expect(scanCss(css)).toEqual([]);
  });

  test('a guard nested above the rule still counts', () => {
    const css = guarded('@supports (animation-timeline: view()) { .r { animation: reveal linear; } }');
    expect(scanCss(css)).toEqual([]);
  });

  test('the guard does not leak to a sibling block', () => {
    const css = `${guarded('.a { animation: draw 1s; }')} .b { animation: draw 1s; }`;
    const problems = scanCss(css);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('animation: draw 1s');
  });
});

describe('the resting state is the final frame', () => {
  test('a forwards fill on a time-driven animation fails', () => {
    const problems = scanCss(guarded('.hero { animation: draw 2s forwards; }'));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('fills forwards');
  });

  test('so does `both`, and so does the longhand', () => {
    expect(scanCss(guarded('.a { animation: draw 2s both; }'))).toHaveLength(1);
    expect(scanCss(guarded('.a { animation: draw 2s; animation-fill-mode: forwards; }'))).toHaveLength(1);
  });

  test('`backwards` is fine — it holds the from state through the delay', () => {
    expect(scanCss(guarded('.a { animation: draw 2s 1s ease backwards; }'))).toEqual([]);
  });

  test('a scroll-driven rule may fill, because the fill is the range and not a frame', () => {
    const css = guarded('.r { animation: reveal linear both; animation-timeline: view(); }');
    expect(scanCss(css)).toEqual([]);
  });

  test('but only in the rule that sets the timeline', () => {
    const css = guarded('.r { animation-timeline: view(); } .s { animation: reveal linear both; }');
    expect(scanCss(css)).toHaveLength(1);
  });
});

describe('reading the source', () => {
  test('comments are not rules', () => {
    expect(scanCss('/* .hero { animation: draw 2s forwards; } */ .a { color: red; }')).toEqual([]);
  });

  test('a problem is reported on the line it is on', () => {
    const css = ['.a {', '  color: red;', '  animation: draw 2s;', '}'].join('\n');
    expect(scanCss(css)[0].line).toBe(3);
  });

  test('an .astro file is read through its style blocks only', () => {
    const source = '<p>animation: draw 2s;</p>\n<style>.a { animation: draw 2s; }</style>';
    expect(scanCss(cssOf(source, '.astro'))).toHaveLength(1);
    expect(cssOf('.a { color: red; }', '.css')).toBe('.a { color: red; }');
  });
});

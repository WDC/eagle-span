/**
 * `bun test`. The Markdoc half of the text pipeline.
 *
 * The parity block at the end is the one that matters. Markdoc and markdown are
 * different parsers with different renderers, and this site carries both — the
 * moment they disagree about a quote character, half the copy is curled and
 * half is not, and nothing in review shows it.
 */
import { describe, expect, test } from 'bun:test';
import Markdoc from '@markdoc/markdoc';

import { typographyNodes } from './markdoc-typography.ts';
import { typo } from './typography.ts';

const NBSP = ' ';

/** Renders to plain text, so an assertion reads as the sentence it is about. */
function render(source: string): string {
  const content = Markdoc.transform(Markdoc.parse(source), {
    nodes: { ...Markdoc.nodes, ...typographyNodes },
    // Astro supplies the slugger that its heading node needs; a stub is enough
    // here, because the ids are not what this file is about.
    ctx: { headingSlugger: { slug: (text: string) => text } },
  });
  const flatten = (node: unknown): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(flatten).join('');
    if (node && typeof node === 'object' && 'children' in node) {
      return flatten((node as { children: unknown[] }).children);
    }
    return '';
  };
  return flatten(content);
}

describe('stages 1, 2 and 4 reach every text node', () => {
  test('curls quotes and apostrophes', () => {
    expect(render('He said "align it" and it was the third visit for that truck.')).toBe(
      `He said “align it” and it was the third visit for that${NBSP}truck.`,
    );
  });

  test('binds a figure to its unit', () => {
    expect(render('Rated to 12,000 lbs.')).toBe(`Rated to 12,000${NBSP}lbs.`);
  });

  test('normalizes a spelled-out degree and a lowercase multiplier', () => {
    expect(render('Caster at 4.5 degrees on a 24 x 8.25 wheel.')).toBe(
      `Caster at 4.5° on a 24${NBSP}×${NBSP}8.25${NBSP}wheel.`,
    );
  });

  test('leaves a code span alone', () => {
    expect(render('Run `bun run check --now` before pushing.')).toBe(
      `Run bun run check --now before${NBSP}pushing.`,
    );
  });
});

describe('widont is a block decision, not a text-node one', () => {
  test('binds the last two words of a paragraph', () => {
    expect(render('The rack measures every axle on the truck.')).toBe(
      `The rack measures every axle on the${NBSP}truck.`,
    );
  });

  /*
   * The failure this prevents: applying widont per text node binds the words
   * before every link in the paragraph as well as the ones at the end.
   */
  test('does not bind before a link in the middle of the block', () => {
    expect(render('Read the [full article](/x) before you book the truck in.')).toBe(
      `Read the full article before you book the truck${NBSP}in.`,
    );
  });

  test('leaves a block under three words alone', () => {
    expect(render('Wheel alignment')).toBe('Wheel alignment');
  });

  test('binds a heading too, not only a paragraph', () => {
    expect(render('## Preventative maintenance intervals')).toBe(
      `Preventative maintenance${NBSP}intervals`,
    );
  });

  /* A long final word cannot fit beside its neighbour, and binding it is how a
   * heading ends up wider than its column. */
  test('leaves a long final word unbound', () => {
    expect(render('## Alignment and driveline documentation')).toBe('Alignment and driveline documentation');
  });
});

describe('Markdoc comes out where the rest of the pipeline does', () => {
  /*
   * `typo()` is what an `.astro` string gets, and `remark-typography.ts` is
   * tested against the same four stages. Equality with `typo()` is therefore
   * equality with markdown too.
   */
  const sentences = [
    'He said "align it" -- the truck\'s third visit at 12,000 lbs.',
    'Caster at 4.5 degrees, camber within 0.01 degrees, on every axle.',
    'Open 8:00-17:00, and the shop is on Interstate 85.',
  ];

  for (const sentence of sentences) {
    test(sentence.slice(0, 40), () => {
      expect(render(sentence)).toBe(typo(sentence));
    });
  }
});

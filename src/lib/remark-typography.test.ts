/**
 * `bun test`. The plugin is exercised against mdast trees rather than markdown
 * source, because what matters is which nodes it touches — the transforms
 * themselves are covered in typography.test.ts.
 *
 * There is no markdown content in the repo yet (Phase 3), so this is the only
 * thing standing between the plugin and its first article.
 */
import { describe, expect, test } from 'bun:test';

import remarkTypography from './remark-typography.ts';

const NBSP = '\u00a0';

interface Node {
  type: string;
  value?: string;
  children?: Node[];
}

const text = (value: string): Node => ({ type: 'text', value });
const run = (tree: Node): Node => {
  remarkTypography()(tree);
  return tree;
};

const paragraph = (...children: Node[]): Node => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const firstText = (tree: Node): string | undefined => tree.children?.[0]?.children?.[0]?.value;
const lastText = (tree: Node): string | undefined => {
  const block = tree.children?.[0];
  const kids = block?.children ?? [];
  const last = kids[kids.length - 1];
  return (last?.children?.[last.children.length - 1] ?? last)?.value;
};

describe('transforms copy', () => {
  /*
   * A one-node paragraph is its own last child, so these show all three stages
   * at once: the unit binds, the last two words bind, the characters normalize.
   */
  test('binds figures to units', () => {
    expect(firstText(run(paragraph(text('Torqued to 110 psi on every wheel end.')))))
      .toBe(`Torqued to 110${NBSP}psi on every wheel${NBSP}end.`);
  });

  test('normalizes characters', () => {
    expect(firstText(run(paragraph(text('Trued to 0.5 deg, every time.')))))
      .toBe(`Trued to 0.5°, every${NBSP}time.`);
  });

  test('applies widont to the last text node of a paragraph', () => {
    expect(firstText(run(paragraph(text('We measure it and then we prove it')))))
      .toBe(`We measure it and then we prove${NBSP}it`);
  });

  test('applies widont to a heading', () => {
    const tree: Node = { type: 'root', children: [{ type: 'heading', children: [text('Wheel alignment for Class 8 tractors')] }] };
    expect(firstText(run(tree))).toBe(`Wheel alignment for Class${NBSP}8${NBSP}tractors`);
  });
});

describe('leaves alone what it must', () => {
  test('code spans', () => {
    const tree = paragraph(text('Run '), { type: 'inlineCode', value: 'bun run check --flag 2 in' });
    run(tree);
    expect(tree.children?.[0]?.children?.[1]?.value).toBe('bun run check --flag 2 in');
  });

  test('fenced code blocks', () => {
    const tree: Node = { type: 'root', children: [{ type: 'code', value: 'const x = "24 in";' }] };
    run(tree);
    expect(tree.children?.[0]?.value).toBe('const x = "24 in";');
  });

  test('raw html', () => {
    const tree = paragraph({ type: 'html', value: '<img alt="a 24 in rim" src="/x.jpg">' });
    run(tree);
    expect(tree.children?.[0]?.children?.[0]?.value).toBe('<img alt="a 24 in rim" src="/x.jpg">');
  });

  test('does not widont a paragraph that ends on a link — the link owns its own text', () => {
    const tree = paragraph(
      text('Read the '),
      { type: 'link', children: [text('full alignment spec sheet')] },
    );
    run(tree);
    expect(firstText(tree)).toBe('Read the ');
    expect(lastText(tree)).toBe(`full alignment spec${NBSP}sheet`);
  });

  test('does not widont a list item', () => {
    const tree: Node = {
      type: 'root',
      children: [{ type: 'list', children: [{ type: 'listItem', children: [text('Brakes and suspension work')] }] }],
    };
    run(tree);
    expect(tree.children?.[0]?.children?.[0]?.children?.[0]?.value).toBe('Brakes and suspension work');
  });
});

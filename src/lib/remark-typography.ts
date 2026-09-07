/**
 * Remark plugin: stages 2–4 of the text pipeline over markdown text nodes.
 *
 * Astro registers remark-smartypants before any user plugin (see
 * `@astrojs/markdown-remark`), so by the time this runs, stage 1 is done and
 * the quotes and dashes in the tree are already the right characters. Ordering
 * therefore comes out as smartypants → nbsp → widont → normalize, which is the
 * order the stages have to run in: widont needs the nbsp pass to have already
 * bound the units, or it can strand a unit on the last line by itself.
 *
 * Only `text` nodes are touched. `inlineCode`, `code` and `html` are skipped,
 * because turning a straight quote into a curly one inside a code span or an
 * embedded attribute produces markup that does not work.
 *
 * Widont is applied per block, to the last text node of a heading or paragraph,
 * and only when that node is the block's final child — otherwise the "last
 * word" is not the last word, it is whatever precedes a link or a bit of
 * emphasis, and binding it does nothing useful.
 *
 * mdast is typed structurally here rather than by depending on `@types/mdast`
 * and `unist-util-visit` for one twenty-line walk.
 */
// Relative, not the `~` alias: this module is loaded by astro.config.mjs, which
// is resolved before the tsconfig path aliases are in play.
import { nbsp, normalize, widont } from './typography.ts';

interface Node {
  type: string;
  value?: string;
  children?: Node[];
}

/** Node types whose text content is copy. Everything else is left alone. */
const OPAQUE = new Set(['code', 'inlineCode', 'html', 'yaml', 'toml', 'math', 'inlineMath', 'definition']);

/** Blocks that get orphan control. A list item or a table cell does not. */
const WIDOWED = new Set(['heading', 'paragraph']);

function transform(node: Node, applyWidont: boolean): void {
  if (OPAQUE.has(node.type)) return;

  if (node.type === 'text' && typeof node.value === 'string') {
    const bound = nbsp(node.value);
    node.value = normalize(applyWidont ? widont(bound) : bound);
    return;
  }

  const children = node.children;
  if (!children) return;

  /*
   * A link is transparent for this purpose: a heading ending in a linked word
   * still wants that word bound to the one before it.
   */
  const lastIndex = children.length - 1;
  const blockWidont = WIDOWED.has(node.type);

  children.forEach((child, i) => {
    transform(child, (blockWidont && i === lastIndex) || (applyWidont && i === lastIndex));
  });
}

export default function remarkTypography() {
  return (tree: Node): void => {
    transform(tree, false);
  };
}

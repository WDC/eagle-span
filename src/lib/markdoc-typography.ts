/**
 * The text pipeline over Markdoc, so `.mdoc` copy comes out of the build
 * identical to the same copy written in markdown or in an `.astro` string.
 *
 * Astro's markdown pipeline runs remark-smartypants and then
 * `src/lib/remark-typography.ts`. Markdoc does not go through remark at all —
 * it has its own parser and its own renderer, and markdown-it's typographer is
 * off — so none of that reaches an `.mdoc` file. Without this module the site
 * would have two classes of content with two sets of quote characters, which is
 * exactly the drift the typography lint exists to prevent.
 *
 * Stage order comes out as smartypants → nbsp → normalize on every text node,
 * then widont once per block:
 *
 *   * A Markdoc paragraph is a list of children — strings interleaved with
 *     tags — so "the last two words of the block" is not a property any single
 *     text node has. Binding per text node would bind the words before every
 *     link in the paragraph instead of the ones at the end. `remark-typography`
 *     solves this the same way, by only applying widont to a block's final
 *     child.
 *   * Running `normalize` before `widont` rather than after is safe in a way
 *     the reverse would not be: widont only replaces one space between the
 *     final two words with U+00A0, and no normalization rule matches on that.
 *
 * Markdoc's renderable tree is typed structurally below rather than by leaning
 * on `RenderableTreeNode` narrowing, for the same reason the remark plugin
 * types mdast by hand: it is a dozen lines and a type import that changes shape
 * between versions is a worse dependency than a shape check.
 */
import { Markdoc, nodes } from '@astrojs/markdoc/config';
import type { Config, Node, RenderableTreeNode, Schema } from '@markdoc/markdoc';

import { nbsp, normalize, smartypants, widont } from './typography.ts';

/** Stages 1, 2 and 4, for one run of text. Widont is a block-level decision. */
export function inlineText(content: string): string {
  return normalize(nbsp(smartypants(content)));
}

interface TagLike {
  children: RenderableTreeNode[];
}

function isTagLike(value: unknown): value is TagLike {
  return typeof value === 'object' && value !== null && Array.isArray((value as TagLike).children);
}

/**
 * Bind the last two words of a block.
 *
 * A tag is transparent here: a heading that ends in a linked word still wants
 * that word bound to the one before it, so the walk descends into the final
 * child rather than stopping at it. Anything else — a spec table, a callout,
 * a block that ends on a tag with no text — is left alone.
 */
function bindLastWords(children: RenderableTreeNode[]): RenderableTreeNode[] {
  if (children.length === 0) return children;

  const lastIndex = children.length - 1;
  const last = children[lastIndex];

  if (typeof last === 'string') {
    const bound = [...children];
    bound[lastIndex] = widont(last);
    return bound;
  }

  if (isTagLike(last)) last.children = bindLastWords(last.children);
  return children;
}

/**
 * Node overrides for `markdoc.config.mjs`. Only these three: everything else
 * either carries no copy or is opaque on purpose — `code` and `fence` must
 * reach the page exactly as typed, and a curled quote inside a command is a
 * command that does not run.
 */
export const typographyNodes = {
  text: {
    ...nodes.text,
    transform(node: Node) {
      const { content } = node.attributes;
      return typeof content === 'string' ? inlineText(content) : content;
    },
  },

  paragraph: {
    ...nodes.paragraph,
    transform(node: Node, config: Config) {
      return new Markdoc.Tag(
        typeof nodes.paragraph.render === 'string' ? nodes.paragraph.render : 'p',
        node.transformAttributes(config),
        bindLastWords(node.transformChildren(config)),
      );
    },
  },

  heading: {
    ...nodes.heading,
    transform(node: Node, config: Config) {
      // Astro's own heading transform owns the slugged `id`; this only reaches
      // into what it produced.
      const tag = nodes.heading.transform?.(node, config);
      if (isTagLike(tag)) tag.children = bindLastWords(tag.children);
      return tag ?? null;
    },
  },
} satisfies Record<string, Schema>;

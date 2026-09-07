// @ts-check
import { component, defineMarkdocConfig, nodes } from '@astrojs/markdoc/config';

import { NODE_COMPONENTS, TAGS } from './src/lib/markdoc-tags.ts';
import { typographyNodes } from './src/lib/markdoc-typography.ts';

/*
 * Markdoc, not MDX, and this file is why.
 *
 * MDX content can import a module and evaluate an expression, which makes every
 * content file a code file: reviewing copy means reviewing JavaScript, and the
 * safe-to-hand-over property the client will eventually want is gone. A Markdoc
 * file can only use the tags declared below, and Astro fails the build on an
 * undeclared tag, a missing required attribute or a value of the wrong type
 * (see raiseValidationErrors in @astrojs/markdoc). That is the whole content
 * security model, and it is enforced by the build rather than by review.
 *
 * The schemas here are generated from `src/lib/markdoc-tags.ts` so the editor
 * in Keystatic and the renderer cannot drift apart. Add a tag there.
 */

/**
 * The one attribute type Markdoc has no built-in for: the rows of a spec table.
 *
 * `type: Array` would accept an array of anything, including an array of
 * strings that renders as `[object Object]`. This checks the shape instead, so
 * a malformed table is a build error naming the row rather than a page that
 * renders wrong.
 */
class SpecRows {
  /**
   * @param {unknown} value
   * @returns {import('@markdoc/markdoc').ValidationError[]} empty when the rows are well formed
   */
  validate(value) {
    if (!Array.isArray(value)) {
      return [{ id: 'specs-rows-type', level: 'critical', message: '`rows` must be an array of spec rows' }];
    }

    /** @type {import('@markdoc/markdoc').ValidationError[]} */
    const errors = [];
    value.forEach((row, i) => {
      const at = `row ${i + 1}`;
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        errors.push({ id: 'specs-row-type', level: 'error', message: `${at} must be an object` });
        return;
      }
      for (const key of ['label', 'value']) {
        if (typeof row[key] !== 'string' || row[key].trim() === '') {
          errors.push({ id: 'specs-row-field', level: 'error', message: `${at} needs a non-empty \`${key}\`` });
        }
      }
      if (row.note !== undefined && typeof row.note !== 'string') {
        errors.push({ id: 'specs-row-field', level: 'error', message: `${at}: \`note\` must be text` });
      }
      for (const key of Object.keys(row)) {
        if (!['label', 'value', 'note'].includes(key)) {
          errors.push({ id: 'specs-row-field', level: 'error', message: `${at}: unknown field \`${key}\`` });
        }
      }
    });

    return errors;
  }
}

/**
 * @param {import('./src/lib/markdoc-tags.ts').TagAttribute} attribute
 * @returns {import('@markdoc/markdoc').SchemaAttribute}
 */
function attributeSchema(attribute) {
  switch (attribute.kind) {
    case 'select':
      return {
        type: String,
        default: attribute.defaultValue,
        matches: attribute.options.map((option) => option.value),
      };
    case 'boolean':
      return { type: Boolean, default: attribute.defaultValue };
    case 'rows':
      return { type: SpecRows, required: true };
    case 'string':
      return {
        type: String,
        required: attribute.required === true,
        ...(attribute.matches ? { matches: attribute.matches } : {}),
      };
  }
}

/*
 * A callout holds prose, not layout. Restricting its children keeps a callout
 * from growing a nested callout or a spec table, which is the point at which
 * body copy has quietly become a page template.
 *
 * Markdoc's own `children` check reports at `warning` level, and Astro only
 * throws on `error` and `critical` — so the declaration alone documents the
 * rule without enforcing it. The `validate` below is the enforcement.
 */
/** @type {import('@markdoc/markdoc').NodeType[]} */
const WRAPPER_CHILDREN = ['paragraph', 'list', 'heading'];

/** @param {import('@markdoc/markdoc').Node} node */
function validateWrapperChildren(node) {
  return node.children
    .filter((child) => !WRAPPER_CHILDREN.includes(child.type))
    .map((child) => ({
      id: 'wrapper-child-invalid',
      level: /** @type {const} */ ('error'),
      message: `A ${node.tag} holds prose: '${child.tag ?? child.type}' belongs in the page, not inside one`,
    }));
}

const tags = Object.fromEntries(
  TAGS.map((tag) => [
    tag.name,
    {
      render: component(tag.component),
      selfClosing: tag.kind !== 'wrapper',
      inline: tag.kind === 'inline',
      ...(tag.kind === 'wrapper' ? { children: WRAPPER_CHILDREN, validate: validateWrapperChildren } : {}),
      attributes: Object.fromEntries(tag.attributes.map((a) => [a.name, attributeSchema(a)])),
    },
  ]),
);

export default defineMarkdocConfig({
  nodes: {
    ...nodes,
    ...typographyNodes,

    /*
     * The root of a rendered entry. Astro's default is `<article>`; this makes
     * it a plain prose container so the template owns the landmark. See
     * NODE_COMPONENTS in src/lib/markdoc-tags.ts for why.
     */
    document: {
      ...nodes.document,
      render: component(NODE_COMPONENTS.document),
    },

    /*
     * Every link out of body copy is external until proven otherwise, and an
     * external link that opens in the same tab from an article is a bounce.
     * Internal paths keep the default. Absolute URLs to this site are not a
     * case worth handling: `data/redirects.csv` and the link check both assume
     * internal links are written as paths.
     */
    link: {
      ...nodes.link,
      render: component(NODE_COMPONENTS.link),
    },
  },

  tags,
});

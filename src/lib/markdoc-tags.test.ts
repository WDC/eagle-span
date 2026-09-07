/**
 * `bun test`. What content is allowed to do.
 *
 * "Markdoc rather than MDX, so there is no arbitrary JavaScript in the content
 * repo" is a claim about a build, not a preference, and this file is where it
 * is checked. Every tag in the manifest has to validate when used correctly,
 * and every way of misusing one has to fail — a content model whose validation
 * quietly passes everything is MDX with extra steps.
 *
 * `@astrojs/markdoc` runs exactly this validation on every `.mdoc` file it
 * loads and throws on an `error` or `critical`, so what passes here is what
 * passes the build.
 */
import { describe, expect, test } from 'bun:test';
import Markdoc from '@markdoc/markdoc';

import markdocConfig from '../../markdoc.config.mjs';
import { TAGS, type TagDefinition } from './markdoc-tags.ts';

/** The ids of the failures Astro would refuse to build on. */
function errors(source: string): string[] {
  return Markdoc.validate(Markdoc.parse(source), markdocConfig as never)
    .filter(({ error }) => error.level === 'error' || error.level === 'critical')
    .map(({ error }) => error.id);
}

/** A correct use of a tag, built from the manifest rather than written out. */
function validUsage(tag: TagDefinition): string {
  const attributes = tag.attributes
    .map((attribute) => {
      switch (attribute.kind) {
        case 'select':
          return `${attribute.name}="${attribute.defaultValue}"`;
        case 'boolean':
          return `${attribute.name}=${attribute.defaultValue}`;
        case 'rows':
          return `${attribute.name}=[{label: "Bays", value: "Six"}]`;
        case 'string':
          // The one string attribute with a pattern is `href`.
          return `${attribute.name}="${attribute.matches ? '/contact' : 'Text'}"`;
      }
    })
    .join(' ');

  const open = `{% ${tag.name}${attributes ? ` ${attributes}` : ''}`;
  if (tag.kind === 'wrapper') return `${open} %}\nBody copy.\n{% /${tag.name} %}`;
  return tag.kind === 'inline' ? `A sentence with ${open} /%} in it.` : `${open} /%}`;
}

describe('every tag in the manifest validates when used correctly', () => {
  for (const tag of TAGS) {
    test(tag.name, () => {
      expect(errors(validUsage(tag))).toEqual([]);
    });
  }
});

test('the renderer knows every tag the manifest declares, and no others', () => {
  expect(Object.keys(markdocConfig.tags ?? {}).sort()).toEqual([...TAGS.map((tag) => tag.name)].sort());
});

describe('and the build refuses everything else', () => {
  const rejected: [string, string, string][] = [
    ['an undeclared tag', '{% marquee /%}', 'tag-undefined'],
    ['a missing required attribute', '{% cta label="Call" /%}', 'attribute-missing-required'],
    ['an off-site destination', '{% cta label="Call" href="https://example.com" /%}', 'attribute-value-invalid'],
    ['a javascript: destination', '{% cta label="Call" href="javascript:alert(1)" /%}', 'attribute-value-invalid'],
    ['an unknown attribute', '{% cta label="Call" href="/contact" onclick="x" /%}', 'attribute-undefined'],
    ['a tone that is not one of the three', '{% callout tone="urgent" %}\nText.\n{% /callout %}', 'attribute-value-invalid'],
    ['a spec table that is not a table', '{% specs rows="six" /%}', 'specs-rows-type'],
    ['a spec row missing its value', '{% specs rows=[{label: "Bays"}] /%}', 'specs-row-field'],
    ['a spec row with an invented field', '{% specs rows=[{label: "Bays", value: "Six", href: "/x"}] /%}', 'specs-row-field'],
    ['an inline tag used as a block', '{% phone /%}', 'tag-placement-invalid'],
    ['layout nested inside a callout', '{% callout %}\n{% specs rows=[{label: "A", value: "B"}] /%}\n{% /callout %}', 'wrapper-child-invalid'],
  ];

  for (const [name, source, id] of rejected) {
    test(name, () => {
      expect(errors(source)).toContain(id);
    });
  }
});

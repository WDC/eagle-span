#!/usr/bin/env node
/**
 * Content typography lint — a CI gate, not a formatter.
 *
 * The migrated Webflow copy carries straight quotes, double hyphens and a
 * lowercase `x` used as a multiplier. Those read as amateur on a site whose
 * entire argument is precision, and they are invisible in review once you have
 * seen the page twice. So the build fails on them instead.
 *
 * This gate and the text pipeline in `src/lib/typography.ts` overlap on
 * purpose, and they are not redundant:
 *
 *   * The pipeline fixes the rendered page. It cannot fix the copy once it
 *     leaves this repo — a meta description pasted into a spreadsheet, a
 *     Google Business Profile post, a heading someone copies off the page.
 *   * This gate fixes the source, so what a writer typed is what ships. It
 *     also catches the cases the pipeline deliberately will not touch, because
 *     they are ambiguous after smartypants has run: a bare `24"` is either an
 *     inch mark or a closing quote, and the pipeline guesses wrong either way.
 *
 * Scope: content and copy only (src/content, src/pages, src/components,
 * src/layouts). Code identifiers are not prose and are skipped.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

// Single source of truth, shared with the pipeline so the gate and the fix
// cannot disagree about what counts as a unit.
import { UNITS } from '../src/lib/typography.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src/content', 'src/pages', 'src/components', 'src/layouts'];
const EXTS = new Set(['.md', '.mdoc', '.markdoc', '.astro', '.yaml', '.yml', '.json']);

const UNIT_ALTERNATION = UNITS.join('|');

/**
 * Markup, not prose: an import, an attribute value, a YAML or JSON key, or a
 * Markdoc tag.
 *
 * Markdoc tag syntax is the reason for the last clause. `{% specs
 * rows=[{label: "Torque", value: "450 lb-ft"}] %}` is a tag, and its string
 * delimiters have to be straight quotes — a curly one is a parse error, not a
 * refinement. The copy inside a wrapper tag sits on its own lines and is still
 * linted; only the tag itself is skipped.
 */
const isCode = (l) =>
  /^\s*(import|export)\b/.test(l) || /[\w-]+=("|')/.test(l) || /\{%|%\}/.test(l);

const RULES = [
  {
    id: 'straight-double-quote',
    re: /"/g,
    message: 'straight double quote — use “ ” (or &ldquo;/&rdquo;)',
    skipLine: (l) => isCode(l) || /^\s*[-\w"']+\s*:\s/.test(l),
  },
  {
    id: 'straight-apostrophe',
    // Catches `RV's` and `don't` in the migrated copy.
    re: /(?<=\w)'(?=\w)/g,
    message: 'straight apostrophe — use ’',
    skipLine: isCode,
  },
  {
    id: 'double-hyphen',
    re: /(?<!<!)--(?!>)/g,
    message: 'double hyphen — use an em dash —',
    skipLine: (l) => isCode(l) || /--[\w-]+\s*:/.test(l) || /var\(--/.test(l),
  },
  {
    id: 'lowercase-x-multiplier',
    re: /\b\d+\s*x\s*\d+\b/g,
    message: 'lowercase x as a multiplier — use × (U+00D7)',
  },
  {
    id: 'missing-nbsp-before-unit',
    // A measurement must never wrap between the figure and its unit.
    re: new RegExp(String.raw`\b\d+(?:[.,]\d+)?[ ](?:${UNIT_ALTERNATION}|°|″|′)\b`, 'g'),
    message: 'plain space before a unit — use a non-breaking space (\\u00a0)',
  },
  {
    id: 'ascii-degree',
    re: /\b\d+(?:\.\d+)?\s*deg(?:rees?)?\b/gi,
    message: 'spelled-out "deg" — use °',
  },
  {
    id: 'ascii-prime',
    // 6'2" style marks in prose should be real prime characters.
    re: /\d'(?:\d|\s|$)/g,
    message: "apostrophe used as a prime — use ′ (and ″ for inches)",
  },
  {
    /*
     * The pipeline will not touch this one: after smartypants a bare 24" is
     * indistinguishable from a sentence that ends on a figure inside a
     * quotation. So it has to be right in the source.
     */
    id: 'ascii-double-prime',
    re: /\d\s*["”](?=\W|$)/g,
    message: 'quote mark used as an inch mark — use ″ (U+2033)',
    skipLine: (l) => isCode(l) || /^\s*[-\w"']+\s*:\s/.test(l),
  },
  {
    id: 'ellipsis',
    re: /\.\.\./g,
    message: 'three periods — use …',
    /*
     * `<h1 {...morph}>` is a spread, not an ellipsis. `isCode` does not see it:
     * a spread carries no `=` and no import keyword, so it looks like prose.
     */
    skipLine: (l) => isCode(l) || /\{\s*\.\.\./.test(l),
  },
  {
    /*
     * Hours are NAP content and appear on every page. `8:00-17:00` with a
     * hyphen is a subtraction; the range takes an en dash.
     */
    id: 'hyphen-range',
    re: /\b\d{1,2}(?::\d{2})?\s*-\s*\d{1,2}(?::\d{2})?\b/g,
    message: 'hyphen between figures — a range takes an en dash –',
    // A phone number, a date and a CSS custom property are not ranges.
    skipLine: (l) =>
      isCode(l) || /\d{3}-\d{3,4}/.test(l) || /\d{4}-\d{2}-\d{2}/.test(l) || /var\(--/.test(l),
  },
  {
    id: 'ascii-multiplication-symbol',
    re: /\b\d+(?:\.\d+)?\s*\*\s*\d/g,
    message: 'asterisk as a multiplier — use × (U+00D7)',
  },
  {
    /*
     * `(c)` and `(r)` only where they are a mark rather than a list letter —
     * an enumerated (a), (b), (c) is not a copyright notice.
     */
    id: 'ascii-trademark',
    re: /\(tm\)|(?<=\w)\((?:c|r)\)|\(c\)(?=\s*\d{4}\b)/gi,
    message: 'ASCII trademark mark — use ™ © ®',
    skipLine: isCode,
  },
  {
    /*
     * Two spaces after a full stop is a typewriter habit that survives copy
     * migration and shows up as a visible gap at this measure.
     */
    id: 'double-space',
    re: /(?<=[.!?])[ ]{2,}(?=[A-Z“‘])/g,
    message: 'two spaces after a sentence — use one',
  },
];

export { RULES };

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

/** Every violation on a line, as `{ rule, column }`. Exported for the tests. */
export function lintLine(line) {
  const found = [];
  for (const rule of RULES) {
    if (rule.skipLine?.(line)) continue;
    rule.re.lastIndex = 0;
    // Every occurrence, not just the first: one pass should be enough to fix a
    // file rather than peeling the same line one character at a time.
    for (const m of line.matchAll(rule.re)) found.push({ rule, column: m.index + 1 });
  }
  return found;
}

function lintFile(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inFrontmatterFence = false;
  // A Markdoc tag whose attributes run over several lines: the opener carries
  // `{%`, the closer `%}`, and the lines between are markup with no `{%` of
  // their own for `isCode` to recognise.
  let inMarkdocTag = false;
  let failures = 0;

  lines.forEach((line, i) => {
    // Astro component script blocks are code, not copy.
    if (line.trim() === '---') { inFrontmatterFence = !inFrontmatterFence; return; }
    if (inFrontmatterFence && extname(file) === '.astro') return;
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;

    const wasInMarkdocTag = inMarkdocTag;
    const opens = line.lastIndexOf('{%');
    const closes = line.lastIndexOf('%}');
    if (opens > closes) inMarkdocTag = true;
    else if (closes > -1) inMarkdocTag = false;
    if (wasInMarkdocTag) return;

    for (const { rule, column } of lintLine(line)) {
      failures += 1;
      console.error(
        `${relative(root, file)}:${i + 1}:${column}  ${rule.id}  ${rule.message}\n    ${line.trim()}`,
      );
    }
  });

  return failures;
}

function main(roots = ROOTS) {
  const files = roots.flatMap((r) => walk(resolve(root, r)));
  const failures = files.reduce((n, file) => n + lintFile(file), 0);
  console.log(
    `\ntypography: ${files.length} files checked, ${RULES.length} rules, ` +
    `${failures} problem${failures === 1 ? '' : 's'}.`,
  );
  return failures;
}

// Importable for the tests; still a CLI when run directly.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const extra = process.argv.slice(2);
  if (main(extra.length ? extra : ROOTS)) process.exit(1);
}

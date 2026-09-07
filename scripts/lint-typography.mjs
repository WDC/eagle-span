#!/usr/bin/env node
/**
 * Content typography lint — a CI gate, not a formatter.
 *
 * The migrated Webflow copy carries straight quotes, double hyphens and a
 * lowercase `x` used as a multiplier. Those read as amateur on a site whose
 * entire argument is precision, and they are invisible in review once you have
 * seen the page twice. So the build fails on them instead.
 *
 * Scope: content and copy only (src/content, src/pages, src/components).
 * Code identifiers are not prose and are skipped.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src/content', 'src/pages', 'src/components', 'src/layouts'];
const EXTS = new Set(['.md', '.mdoc', '.markdoc', '.astro', '.yaml', '.yml', '.json']);

const RULES = [
  {
    id: 'straight-double-quote',
    re: /"/g,
    message: 'straight double quote — use “ ” (or &ldquo;/&rdquo;)',
    /* Attribute values and imports are markup, not prose. */
    skipLine: (l) => /^\s*(import|export)\b/.test(l) || /[\w-]+=("|')/.test(l) || /^\s*[-\w"']+\s*:\s/.test(l),
  },
  {
    id: 'straight-apostrophe',
    re: /(?<=\w)'(?=\w)/g,
    message: 'straight apostrophe — use ’',
    skipLine: (l) => /^\s*(import|export)\b/.test(l) || /[\w-]+=("|')/.test(l),
  },
  {
    id: 'double-hyphen',
    re: /(?<!<!)--(?!>)/g,
    message: 'double hyphen — use an em dash —',
    skipLine: (l) => /^\s*(import|export)\b/.test(l) || /--[\w-]+\s*:/.test(l) || /var\(--/.test(l),
  },
  {
    id: 'lowercase-x-multiplier',
    re: /\b\d+\s*x\s*\d+\b/g,
    message: 'lowercase x as a multiplier — use × (U+00D7)',
  },
  {
    id: 'missing-nbsp-before-unit',
    // A measurement must never wrap between the figure and its unit.
    re: /\b\d+(?:\.\d+)?[ ](?:in|ft|lb|lbs|psi|mm|cm|kg|mi|hp|qt|gal|°|″|′)\b/g,
    message: 'plain space before a unit — use a non-breaking space (\\u00a0)',
  },
  {
    id: 'ascii-degree',
    re: /\b\d+(?:\.\d+)?\s*deg\b/gi,
    message: 'spelled-out "deg" — use °',
  },
  {
    id: 'ascii-prime',
    // 6'2" style marks in prose should be real prime characters.
    re: /\d'(?:\d|\s|$)/g,
    message: "apostrophe used as a prime — use ′ (and ″ for inches)",
  },
  {
    id: 'ellipsis',
    re: /\.\.\./g,
    message: 'three periods — use …',
  },
];

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

const files = ROOTS.flatMap((r) => walk(resolve(root, r)));
let failures = 0;

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inFrontmatterFence = false;

  lines.forEach((line, i) => {
    // Astro component script blocks are code, not copy.
    if (line.trim() === '---') { inFrontmatterFence = !inFrontmatterFence; return; }
    if (inFrontmatterFence && extname(file) === '.astro') return;
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;

    for (const rule of RULES) {
      if (rule.skipLine?.(line)) continue;
      rule.re.lastIndex = 0;
      const m = rule.re.exec(line);
      if (m) {
        failures += 1;
        console.error(
          `${relative(root, file)}:${i + 1}:${m.index + 1}  ${rule.id}  ${rule.message}\n    ${line.trim()}`,
        );
      }
    }
  });
}

console.log(`\ntypography: ${files.length} files checked, ${failures} problem${failures === 1 ? '' : 's'}.`);
if (failures) process.exit(1);

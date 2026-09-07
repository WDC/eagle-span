#!/usr/bin/env node
/**
 * Colour gates on the design tokens.
 *
 * Two rules, both from the Phase 2 direction, both of the kind that pass review
 * and fail an audit:
 *
 *   1. Every token used as a text colour clears WCAG AA (4.5:1) against both
 *      page grounds. The axe job covers rendered pages, but it only runs once
 *      PREVIEW_URL is set, and a contrast failure baked into a token is much
 *      cheaper to catch here than after fourteen service pages use it.
 *   2. Alignment-target green stays reserved. `--c-target` is the mark — an
 *      indicator, a rule, an in-spec tick. The moment it is a `color:` it has
 *      to be `--c-target-ink`, which is the same green dark enough to read.
 *
 * Tokens are parsed out of tokens.css rather than duplicated here, so a value
 * cannot be changed without this seeing it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokensCss = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8');

const tokens = Object.fromEntries(
  [...tokensCss.matchAll(/(--c-[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
);

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Tokens that carry text, and the grounds they are allowed to carry it on. */
const TEXT_TOKENS = ['--c-ink', '--c-ink-2', '--c-ink-3', '--c-blue', '--c-blue-deep', '--c-red', '--c-target-ink'];
const GROUNDS = ['--c-ground', '--c-ground-2'];
const AA = 4.5;

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`FAIL ${msg}`); };

for (const token of TEXT_TOKENS) {
  const value = tokens[token];
  if (!value) { fail(`${token} is not defined in tokens.css`); continue; }

  for (const groundToken of GROUNDS) {
    const ground = tokens[groundToken];
    if (!ground) { fail(`${groundToken} is not defined in tokens.css`); continue; }

    const ratio = contrast(value, ground);
    if (ratio < AA) {
      fail(`${token} (${value}) on ${groundToken} (${ground}) is ${ratio.toFixed(2)}:1, under AA ${AA}:1`);
    }
  }
}

/*
 * The reserved-green rule, as something a build can check: the mark value may
 * appear anywhere except in a `color:`. Nothing stops a determined author from
 * routing around it, but it catches the honest mistake, which is the one that
 * actually happens — reaching for the green because the reading is green and
 * not noticing that this particular reading is 16px text.
 */
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.css', '.astro'].includes(extname(p))) out.push(p);
  }
  return out;
}

for (const file of walk(resolve(root, 'src'))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/(?<!-)\bcolor:\s*var\(--c-target\)/.test(line)) {
      fail(
        `${relative(root, file)}:${i + 1}: --c-target used as a text colour ` +
        `(3.37:1). Use --c-target-ink.\n    ${line.trim()}`,
      );
    }
  });
}

const checked = TEXT_TOKENS.length * GROUNDS.length;
console.log(
  `\ntokens: ${Object.keys(tokens).length} colour tokens, ${checked} contrast pairs checked, ` +
  `${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

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
const TEXT_TOKENS = [
  '--c-ink',
  '--c-ink-2',
  '--c-ink-3',
  '--c-blue',
  '--c-blue-deep',
  '--c-red',
  '--c-target-ink',
  '--c-amber-ink',
];

/*
 * Every ground a paragraph can land on, which now includes the four washes: a
 * callout is a tint with body copy on it, and an ink that clears AA on white
 * and fails on the tint under it is exactly the defect this gate exists for.
 */
const GROUNDS = [
  '--c-ground',
  '--c-ground-2',
  '--c-wash-blue',
  '--c-wash-green',
  '--c-wash-amber',
  '--c-wash-red',
];

/** The dark band, and the inks written for it. */
const DARK_GROUNDS = ['--c-deep', '--c-deep-2', '--c-deep-3'];
const DARK_TEXT_TOKENS = [
  '--c-on-deep',
  '--c-on-deep-2',
  '--c-on-deep-3',
  '--c-target-on-deep',
  '--c-blue-on-deep',
  '--c-red-on-deep',
  '--c-amber-on-deep',
];

const AA = 4.5;

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`FAIL ${msg}`); };

let pairs = 0;

/** Every text token against every ground it is allowed on. */
function checkPairs(textTokens, groundTokens, resolve = (t) => tokens[t]) {
  for (const token of textTokens) {
    const value = resolve(token);
    if (!value) { fail(`${token} is not defined in tokens.css`); continue; }

    for (const groundToken of groundTokens) {
      const ground = resolve(groundToken);
      if (!ground) { fail(`${groundToken} is not defined in tokens.css`); continue; }

      pairs += 1;
      const ratio = contrast(value, ground);
      if (ratio < AA) {
        fail(`${token} (${value}) on ${groundToken} (${ground}) is ${ratio.toFixed(2)}:1, under AA ${AA}:1`);
      }
    }
  }
}

checkPairs(TEXT_TOKENS, GROUNDS);
checkPairs(DARK_TEXT_TOKENS, DARK_GROUNDS);

/*
 * The inverted band, checked through its own mapping.
 *
 * `.t-deep` in global.css is a dark section, and it works by remapping the ink
 * and ground tokens rather than by restyling components — see the comment on
 * the rule. That makes it the one place a component can end up with an
 * unreadable pair without any single token being wrong: every value is fine,
 * and the mapping between them is what would be broken.
 *
 * So the mapping is resolved here and the same AA check is run through it. A
 * `--c-ink-2: var(--c-on-deep-2)` that someone points at the wrong token fails
 * the build, and so does one that is left out — an unmapped ink stays at its
 * light value and lands on near-black.
 */
const globalCss = readFileSync(resolve(root, 'src/styles/global.css'), 'utf8');
const themeBlock = /\.t-deep\s*\{([\s\S]*?)\n\}/.exec(globalCss);

if (!themeBlock) {
  fail('src/styles/global.css has no .t-deep rule — the dark band cannot be checked');
} else {
  const mapping = Object.fromEntries(
    [...themeBlock[1].matchAll(/(--c-[\w-]+):\s*var\((--c-[\w-]+)\)\s*;/g)].map((m) => [m[1], m[2]]),
  );

  /* A token the theme does not remap keeps its light value — which is the bug. */
  const inTheme = (token) => tokens[mapping[token] ?? token];

  for (const token of [...TEXT_TOKENS, ...GROUNDS.slice(0, 2)]) {
    if (!mapping[token]) fail(`.t-deep does not remap ${token} — it would keep its light value on the dark ground`);
  }

  checkPairs(TEXT_TOKENS, ['--c-ground', '--c-ground-2'], inTheme);
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

/*
 * The marks, and what to use instead. Each of these is a colour that is correct
 * as a rule, a tick or a 2px border and is a contrast failure the moment it
 * carries a word.
 */
const MARKS_ONLY = [
  ['--c-target', '3.37:1 on white', '--c-target-ink (or --c-target-on-deep on the dark band)'],
  ['--c-amber', '4.46:1 on --c-wash-red', '--c-amber-ink (or --c-amber-on-deep on the dark band)'],
  ['--c-ink-4', '3.31:1 on white', '--c-ink-3 (or --c-on-deep-3 on the dark band)'],
];

for (const file of walk(resolve(root, 'src'))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const [token, ratio, instead] of MARKS_ONLY) {
      /* `border-color:` and `--c-x:` both end in `color:`; neither is text. */
      const re = new RegExp(String.raw`(?<![-\w])color:\s*var\(${token}\)`);
      if (re.test(line)) {
        fail(
          `${relative(root, file)}:${i + 1}: ${token} used as a text colour ` +
          `(${ratio}). Use ${instead}.\n    ${line.trim()}`,
        );
      }
    }
  });
}

console.log(
  `\ntokens: ${Object.keys(tokens).length} colour tokens, ${pairs} contrast pairs checked ` +
  `(light, dark and through the .t-deep mapping), ${failures} problem${failures === 1 ? '' : 's'}.`,
);
if (failures) process.exit(1);

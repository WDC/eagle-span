/**
 * `bun test`. Every rule is exercised against a violation lifted from the live
 * Webflow copy (or the shape of one) and against its corrected form.
 *
 * The second half matters more than the first. A typography lint that fires on
 * correct copy gets switched off within a week, so each rule has to prove it
 * stays quiet on the fixed text, on the code around it, and on the NAP — the
 * phone number and the postal code are figures with hyphens in them and they
 * are on every page.
 */
import { describe, expect, test } from 'bun:test';

import { RULES, lintLine } from './lint-typography.mjs';

const ids = (line) => lintLine(line).map(({ rule }) => rule.id);

/** [rule id, a line that must fail, the same line corrected] */
const CASES = [
  ['straight-double-quote', 'They said "we cannot align that" and sent him here.', 'They said “we cannot align that” and sent him here.'],
  ['straight-apostrophe', "RV's and box trucks welcome.", 'RV’s and box trucks welcome.'],
  ['double-hyphen', 'Precision -- not decoration.', 'Precision — not decoration.'],
  ['lowercase-x-multiplier', 'Fits a 24 x 8.25 wheel.', 'Fits a 24 × 8.25 wheel.'],
  ['missing-nbsp-before-unit', 'Rated to 12,000 lbs of capacity.', 'Rated to 12,000\u00a0lbs of capacity.'],
  ['ascii-degree', 'Caster set to 4.5 degrees.', 'Caster set to 4.5°.'],
  ['ascii-prime', "A 53' trailer.", 'A 53′ trailer.'],
  ['ascii-double-prime', 'Wheels up to 24".', 'Wheels up to 24″.'],
  ['ellipsis', 'And then... it drifted.', 'And then… it drifted.'],
  ['hyphen-range', 'Open 8:00-17:00.', 'Open 8:00–17:00.'],
  ['ascii-multiplication-symbol', 'Torque 3 * 4 passes.', 'Torque 3 × 4 passes.'],
  ['ascii-trademark', 'EagleSpan(tm) alignment.', 'EagleSpan™ alignment.'],
  ['double-space', 'We align it.  Then we prove it.', 'We align it. Then we prove it.'],
];

describe('every rule fires on a real violation', () => {
  for (const [id, bad] of CASES) {
    test(id, () => {
      expect(ids(bad)).toContain(id);
    });
  }
});

describe('and stays quiet once it is fixed', () => {
  for (const [id, , good] of CASES) {
    test(id, () => {
      expect(ids(good)).not.toContain(id);
    });
  }
});

test('every rule in the linter is covered by a case', () => {
  expect(CASES.map(([id]) => id).sort()).toEqual(RULES.map((r) => r.id).sort());
});

describe('does not fire on copy that is already correct', () => {
  const clean = [
    'Heavy-duty truck and trailer repair in Charlotte, North Carolina.',
    'Alignment, brakes and suspension for Class\u00a08 tractors.',
    'Camber, caster and toe measured to 0.01° on every axle.',
    'Monday – Friday, 8:00–17:00.',
    'A 24\u00a0×\u00a08.25 wheel, trued to 0.5\u00a0mm.',
    // (a), (b), (c) is a list, not a copyright notice.
    'Choose (a) alignment, (b) brakes or (c) both.',
  ];
  for (const line of clean) {
    test(line.slice(0, 42), () => {
      expect(lintLine(line)).toEqual([]);
    });
  }
});

describe('does not fire on the NAP or on markup', () => {
  const allowed = [
    // The phone number and the postal code are figures with hyphens in them.
    'phoneDisplay: (704) 392-9938',
    '<a href="tel:+17043929938">(704) 392-9938</a>',
    '3815 Beasley Lane, Charlotte, NC 28206',
    // Imports, attributes and CSS custom properties are not prose.
    "import { site } from '~/site.config.ts';",
    '<meta name="description" content={description} />',
    '  border-block-start: var(--hairline) solid var(--c-rule);',
    '  "postalCode": "28206",',
  ];
  for (const line of allowed) {
    test(line.slice(0, 42), () => {
      expect(lintLine(line)).toEqual([]);
    });
  }
});

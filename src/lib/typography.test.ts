/**
 * `bun test`. These are the cases the pipeline exists for, plus the ones where
 * it has to keep its hands off — the false positives are the interesting half.
 */
import { describe, expect, test } from 'bun:test';

import { nbsp, normalize, smartypants, typo, widont } from './typography.ts';

const NBSP = '\u00a0';

describe('smartypants', () => {
  test('curls quotes by context', () => {
    expect(smartypants('He said "align it" twice.')).toBe('He said “align it” twice.');
    expect(smartypants("the shop's bay")).toBe('the shop’s bay');
    expect(smartypants("RV's and trailers")).toBe('RV’s and trailers');
    expect(smartypants("'26 models")).toBe('’26 models');
  });

  test('makes dashes', () => {
    expect(smartypants('8--5 daily')).toBe('8–5 daily');
    expect(smartypants('precision --- not decoration')).toBe('precision — not decoration');
  });
});

describe('nbsp', () => {
  test('binds a figure to its unit', () => {
    expect(nbsp('a 24 in stroke')).toBe(`a 24${NBSP}in stroke`);
    expect(nbsp('rated to 12,000 lbs')).toBe(`rated to 12,000${NBSP}lbs`);
    expect(nbsp('to 110 psi')).toBe(`to 110${NBSP}psi`);
  });

  test('closes a figure up against a symbol unit', () => {
    expect(nbsp('caster at 4.5 °')).toBe('caster at 4.5°');
    expect(nbsp('within 2 %')).toBe('within 2%');
  });

  test('binds a reference to its number', () => {
    expect(nbsp('a Class 8 tractor')).toBe(`a Class${NBSP}8 tractor`);
    expect(nbsp('off Interstate 85')).toBe(`off Interstate${NBSP}85`);
  });

  test('leaves a capitalised preposition alone', () => {
    expect(nbsp('In 2019 we moved')).toBe('In 2019 we moved');
  });
});

describe('widont', () => {
  test('binds the last two words', () => {
    expect(widont('Heavy-duty truck repair in Charlotte')).toBe(
      `Heavy-duty truck repair in${NBSP}Charlotte`,
    );
  });

  test('leaves short phrases alone', () => {
    expect(widont('Wheel alignment')).toBe('Wheel alignment');
    expect(widont('Contact us')).toBe('Contact us');
  });

  test('will not bind a long final word, which would force overflow', () => {
    expect(widont('We do commercial fleet recalibration')).toBe(
      'We do commercial fleet recalibration',
    );
  });

  test('preserves trailing whitespace', () => {
    expect(widont('one two three four ')).toBe(`one two three${NBSP}four `);
  });
});

describe('normalize', () => {
  test('fixes the characters the lint rejects', () => {
    expect(normalize('Wait...')).toBe('Wait…');
    expect(normalize('a 24 x 8.25 wheel')).toBe(`a 24${NBSP}×${NBSP}8.25 wheel`);
    expect(normalize('camber at 2 degrees')).toBe('camber at 2°');
    expect(normalize('toe of 0.5 deg')).toBe('toe of 0.5°');
    expect(normalize('EagleSpan(tm)')).toBe('EagleSpan™');
  });

  test('makes feet and inches real primes', () => {
    expect(normalize('a 6\'2" frame')).toBe('a 6′2″ frame');
    expect(normalize('a 53\' trailer')).toBe('a 53′ trailer');
  });

  test('reads an hour range as a range, not a subtraction', () => {
    expect(normalize('8:00-17:00')).toBe('8:00–17:00');
    expect(normalize('open 8 - 5')).toBe('open 8–5');
  });

  test('uses a minus sign only where the figure carries a unit', () => {
    expect(normalize('down to -20 °')).toBe('down to −20°');
    expect(normalize(`toe of -3${NBSP}mm`)).toBe(`toe of −3${NBSP}mm`);
    /*
     * A bare figure is not a reading. The range rule runs first and claims
     * this, which is the right answer: a spaced hyphen between two numbers is
     * a range far more often than it is a subtraction.
     */
    expect(normalize('bays 2 - 3')).toBe('bays 2–3');
    // Dashes between words are left to smartypants.
    expect(normalize('Monday - Friday')).toBe('Monday - Friday');
  });

  test('leaves a closing quote after a figure alone', () => {
    // Indistinguishable from an inch mark after smartypants; the lint owns it.
    expect(normalize('he said “about 24”')).toBe('he said “about 24”');
  });
});

describe('typo', () => {
  test('runs the four stages in order', () => {
    expect(typo('The shop\'s 24 in alignment rack -- precision, not decoration')).toBe(
      `The shop’s 24${NBSP}in alignment rack – precision, not${NBSP}decoration`,
    );
  });

  test('skips widont where nothing wraps', () => {
    expect(typo('Heavy-duty truck repair in Charlotte', { widont: false })).toBe(
      'Heavy-duty truck repair in Charlotte',
    );
  });

  test('is idempotent — a second pass changes nothing', () => {
    const once = typo('A 24 x 8.25 wheel, trued to 0.5 deg... every time');
    expect(typo(once)).toBe(once);
  });
});

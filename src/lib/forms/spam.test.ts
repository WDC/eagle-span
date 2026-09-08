import { describe, expect, test } from 'bun:test';

import { HONEYPOT_FIELD, TIMING_FIELD, TURNSTILE_FIELD } from './fields.ts';
import { checkHoneypot, checkRateLimit, checkTiming, screen, verifyTurnstile } from './spam.ts';
import type { FormDataLike } from './validate.ts';

function form(values: Record<string, unknown>): FormDataLike {
  return {
    get: (name) => values[name] ?? null,
    getAll: (name) => (name in values ? [values[name]] : []),
  };
}

/** A `fetch` that answers with one canned response and records what it was asked. */
function stubFetch(body: unknown, ok = true) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const NOW = 1_800_000_000_000;

describe('the honeypot', () => {
  test('an empty field is a person', () => {
    expect(checkHoneypot(form({ [HONEYPOT_FIELD]: '' }))).toBe(true);
    expect(checkHoneypot(form({}))).toBe(true);
  });

  test('a filled field is not', () => {
    expect(checkHoneypot(form({ [HONEYPOT_FIELD]: 'http://example.com' }))).toBe(false);
  });

  test('whitespace is still empty — a stray keystroke is not a bot', () => {
    expect(checkHoneypot(form({ [HONEYPOT_FIELD]: '  ' }))).toBe(true);
  });
});

describe('the timing trap', () => {
  test('a submission inside three seconds was not typed', () => {
    expect(checkTiming(form({ [TIMING_FIELD]: String(NOW - 500) }), NOW)).toBe('too-fast');
  });

  test('a submission after a normal fill passes', () => {
    expect(checkTiming(form({ [TIMING_FIELD]: String(NOW - 45_000) }), NOW)).toBe('ok');
  });

  /*
   * The load-bearing one. No stamp is the state of every reader with
   * JavaScript off, and treating it as a failure would refuse exactly the
   * audience the no-script form exists for.
   */
  test('no stamp is no signal, not a rejection', () => {
    expect(checkTiming(form({}), NOW)).toBe('absent');
    expect(checkTiming(form({ [TIMING_FIELD]: '' }), NOW)).toBe('absent');
    expect(checkTiming(form({ [TIMING_FIELD]: 'not-a-number' }), NOW)).toBe('absent');
  });

  test('a stamp from the future or from last week is unreadable, not fatal', () => {
    expect(checkTiming(form({ [TIMING_FIELD]: String(NOW + 60_000) }), NOW)).toBe('absent');
    expect(checkTiming(form({ [TIMING_FIELD]: String(NOW - 8 * 24 * 60 * 60 * 1000) }), NOW)).toBe('absent');
  });
});

describe('Turnstile', () => {
  const config = { secret: 'secret' };

  test('a token Cloudflare accepts is a pass', async () => {
    const { impl, calls } = stubFetch({ success: true });
    expect(await verifyTurnstile(config, form({ [TURNSTILE_FIELD]: 'token' }), '203.0.113.4', impl)).toBe(true);
    expect(calls[0]?.url).toContain('challenges.cloudflare.com');
  });

  test('a token it rejects is a fail', async () => {
    const { impl } = stubFetch({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await verifyTurnstile(config, form({ [TURNSTILE_FIELD]: 'token' }), null, impl)).toBe(false);
  });

  test('no configuration and no token both mean no signal', async () => {
    const { impl } = stubFetch({ success: true });
    expect(await verifyTurnstile(null, form({ [TURNSTILE_FIELD]: 'token' }), null, impl)).toBeNull();
    expect(await verifyTurnstile(config, form({}), null, impl)).toBeNull();
  });

  test('an outage at Cloudflare does not close the shop', async () => {
    const failing = (() => Promise.reject(new Error('network'))) as unknown as typeof fetch;
    expect(await verifyTurnstile(config, form({ [TURNSTILE_FIELD]: 'token' }), null, failing)).toBeNull();
  });
});

describe('the rate limit', () => {
  const config = { url: 'https://redis.example.com', token: 'token' };

  test('under the ceiling is allowed', async () => {
    const { impl } = stubFetch([{ result: 2 }, { result: 1 }]);
    expect(await checkRateLimit(config, 'key', 5, 600, impl)).toEqual({ allowed: true, count: 2 });
  });

  test('at the ceiling is still allowed; past it is not', async () => {
    const at = stubFetch([{ result: 5 }, { result: 1 }]);
    expect((await checkRateLimit(config, 'key', 5, 600, at.impl)).allowed).toBe(true);
    const past = stubFetch([{ result: 6 }, { result: 1 }]);
    expect((await checkRateLimit(config, 'key', 5, 600, past.impl)).allowed).toBe(false);
  });

  test('no limiter configured means no limit, and says so', async () => {
    const { impl, calls } = stubFetch([{ result: 99 }]);
    expect(await checkRateLimit(null, 'key', 1, 600, impl)).toEqual({ allowed: true, count: null });
    expect(calls).toHaveLength(0);
  });

  test('an unreachable limiter fails open', async () => {
    const failing = (() => Promise.reject(new Error('network'))) as unknown as typeof fetch;
    expect(await checkRateLimit(config, 'key', 1, 600, failing)).toEqual({ allowed: true, count: null });
  });
});

describe('the four layers together', () => {
  const base = {
    remoteIp: '203.0.113.4',
    turnstile: null,
    rateLimit: null,
    now: NOW,
  };

  test('a plain no-script submission is accepted, and marked unverified', async () => {
    const verdict = await screen({ ...base, data: form({}) });
    expect(verdict.accept).toBe(true);
    expect(verdict.verified).toBe(false);
    expect(verdict.signals).toContain('timing:absent');
    expect(verdict.signals).toContain('turnstile:no-signal');
  });

  test('a filled honeypot stops before anything else runs', async () => {
    const verdict = await screen({ ...base, data: form({ [HONEYPOT_FIELD]: 'x' }) });
    expect(verdict.accept).toBe(false);
    // Nothing after the honeypot ran, which is the point of the ordering.
    expect(verdict.signals).toEqual(['honeypot:filled']);
  });

  test('an instant submission is stopped before the network is touched', async () => {
    const { impl, calls } = stubFetch({ success: true });
    const verdict = await screen({
      ...base,
      data: form({ [TIMING_FIELD]: String(NOW - 100) }),
      turnstile: { secret: 's' },
      fetchImpl: impl,
    });
    expect(verdict.accept).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test('a verified submission gets the generous ceiling', async () => {
    // Four in the window: past the unverified limit of 3, inside the verified 5.
    const withCount = ((url: string) => {
      if (String(url).includes('challenges.cloudflare.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ result: 4 }, { result: 1 }]) } as Response);
    }) as unknown as typeof fetch;

    const verdict = await screen({
      ...base,
      data: form({ [TURNSTILE_FIELD]: 'token', [TIMING_FIELD]: String(NOW - 30_000) }),
      turnstile: { secret: 's' },
      rateLimit: { url: 'https://redis.example.com', token: 't' },
      fetchImpl: withCount,
    });
    expect(verdict.verified).toBe(true);
    expect(verdict.accept).toBe(true);
  });

  test('the same four unverified are over the strict ceiling', async () => {
    const limited = (() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([{ result: 4 }, { result: 1 }]) } as Response)) as unknown as typeof fetch;

    const verdict = await screen({
      ...base,
      data: form({}),
      rateLimit: { url: 'https://redis.example.com', token: 't' },
      fetchImpl: limited,
    });
    expect(verdict.verified).toBe(false);
    expect(verdict.accept).toBe(false);
  });

  test('a token Cloudflare rejects is refused outright', async () => {
    const rejecting = (() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false }) } as Response)) as unknown as typeof fetch;

    const verdict = await screen({
      ...base,
      data: form({ [TURNSTILE_FIELD]: 'forged', [TIMING_FIELD]: String(NOW - 30_000) }),
      turnstile: { secret: 's' },
      fetchImpl: rejecting,
    });
    expect(verdict.accept).toBe(false);
  });
});

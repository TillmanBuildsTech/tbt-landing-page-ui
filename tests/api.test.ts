import { describe, expect, it } from 'vitest';
import {
  createLimiter,
  getClientIp,
  isSpamBot,
  isValidEmail,
  jsonResponse,
} from '../src/lib/api';

describe('createLimiter', () => {
  it('allows requests within the window', () => {
    const limiter = createLimiter(2, 60_000);
    expect(limiter('a')).toBe(true);
    expect(limiter('a')).toBe(true);
  });

  it('blocks once the max is reached', () => {
    const limiter = createLimiter(2, 60_000);
    limiter('b');
    limiter('b');
    expect(limiter('b')).toBe(false);
  });

  it('tracks keys independently', () => {
    const limiter = createLimiter(1, 60_000);
    expect(limiter('c')).toBe(true);
    expect(limiter('c')).toBe(false);
    expect(limiter('d')).toBe(true);
  });

  it('expires hits after the window', () => {
    const limiter = createLimiter(1, 50);
    expect(limiter('e')).toBe(true);
    expect(limiter('e')).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(limiter('e')).toBe(true);
        resolve(undefined);
      }, 70);
    });
  });
});

describe('getClientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-real-ip': '9.9.9.9' },
    });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('defaults to unknown', () => {
    expect(getClientIp(new Request('http://localhost/'))).toBe('unknown');
  });
});

describe('isSpamBot', () => {
  it('returns true when the honeypot is filled', () => {
    const data = new FormData();
    data.set('website', 'http://spam.example');
    expect(isSpamBot(data)).toBe(true);
  });

  it('returns false when the honeypot is empty', () => {
    const data = new FormData();
    data.set('website', '');
    expect(isSpamBot(data)).toBe(false);
  });

  it('returns false when the field is absent', () => {
    expect(isSpamBot(new FormData())).toBe(false);
  });
});

describe('isValidEmail', () => {
  it.each([
    ['jane@company.com', true],
    ['a.b+c@sub.example.co', true],
    ['not-an-email', false],
    ['missing@tld', false],
    ['@nobody.com', false],
    ['', false],
  ])('validates %s → %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe('jsonResponse', () => {
  it('serializes JSON with content-type header', () => {
    const res = jsonResponse({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
    return res.json().then((body) => expect(body).toEqual({ ok: true }));
  });
});

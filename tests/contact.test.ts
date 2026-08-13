import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST, ALL } from '../src/pages/api/contact';
import {
  MAX_BODY_BYTES,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
} from '../src/lib/api';

const TWENTY_KEY = 'test-twenty-key';

function post(body: Record<string, string>, ip = '10.0.0.1'): Promise<Response> {
  const data = new FormData();
  for (const [k, v] of Object.entries(body)) data.set(k, v);
  return POST({
    request: new Request('http://localhost/api/contact', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
      body: data,
    }),
  });
}

function okJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/contact', () => {
  it('returns 405 for other methods', async () => {
    const res = await ALL();
    expect(res.status).toBe(405);
  });

  it('returns 500 when TWENTY_API_KEY is not configured', async () => {
    vi.stubEnv('TWENTY_API_KEY', '');
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/misconfig/i);
  });

  it('returns 400 for an invalid request body', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const res = await POST({ request: new Request('http://localhost/api/contact', { method: 'POST' }) });
    expect(res.status).toBe(400);
  });

  it('returns a fake 200 for honeypot submissions (no Twenty call)', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'Bot', email: 'bot@x.com', message: 'spam', website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 after the rate limit', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ data: { createPerson: { id: 'p1' } } }, 201)));
    for (let i = 0; i < 5; i++) {
      const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.99.0.1');
      expect(res.status).toBe(200);
    }
    const blocked = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.99.0.1');
    expect(blocked.status).toBe(429);
  });

  it.each([
    [{ name: '', email: 'jane@x.com', message: 'hi' }, /name/i],
    [{ name: 'Jane', email: 'not-an-email', message: 'hi' }, /email/i],
    [{ name: 'Jane', email: 'jane@x.com', message: '' }, /message/i],
  ])('validates fields (%#)', async (fields, errorPattern) => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const res = await post(fields, '10.77.0.1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(errorPattern);
  });

  it('rejects a message over the length cap without calling Twenty', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }, '10.76.0.1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`message must be ${MAX_MESSAGE_LENGTH}`, 'i'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a message at exactly the length cap', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn().mockResolvedValueOnce(okJson({ data: { createPerson: { id: 'person-123' } } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'x'.repeat(MAX_MESSAGE_LENGTH) }, '10.75.0.1');
    expect(res.status).toBe(200);
  });

  it('rejects a name over the length cap without calling Twenty', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'J'.repeat(MAX_NAME_LENGTH + 1), email: 'jane@x.com', message: 'hi' }, '10.74.0.1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`name must be ${MAX_NAME_LENGTH}`, 'i'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an email over the length cap without calling Twenty', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const longEmail = `${'a'.repeat(MAX_EMAIL_LENGTH)}@x.com`;
    expect(longEmail.length).toBeGreaterThan(MAX_EMAIL_LENGTH);
    const res = await post({ name: 'Jane', email: longEmail, message: 'hi' }, '10.73.0.1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`email must be ${MAX_EMAIL_LENGTH}`, 'i'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown project type without calling Twenty', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post(
      { name: 'Jane', email: 'jane@x.com', message: 'hi', project_type: 'constructor' },
      '10.72.0.1'
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid project type/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized request bodies with 413 before parsing', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost/api/contact', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.71.0.1' },
      body: 'x'.repeat(100),
    });
    req.headers.set('content-length', String(MAX_BODY_BYTES + 1));
    const res = await POST({ request: req });
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips control characters from the name before storing', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn().mockResolvedValueOnce(okJson({ data: { createPerson: { id: 'person-123' } } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'Jane\u0000\u000ASmith', email: 'jane@x.com', message: 'hi' }, '10.70.0.1');
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toEqual({ firstName: 'Jane', lastName: 'Smith' });
  });

  it('creates a Person with the message in Twenty on success', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn().mockResolvedValueOnce(okJson({ data: { createPerson: { id: 'person-123' } } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const res = await post(
      { name: 'Jane Smith', email: 'jane@company.com', message: 'Need help with AI agents', project_type: 'ai-agents' },
      '10.66.0.1'
    );

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [personCall] = fetchMock.mock.calls;

    expect(personCall[0]).toBe('https://crm.tillmanbuildstech.com/rest/people');
    const personInit = personCall[1] as RequestInit;
    expect(personInit.method).toBe('POST');
    expect(personInit.headers).toMatchObject({ Authorization: 'Bearer test-twenty-key' });
    const personBody = JSON.parse(personInit.body as string);
    expect(personBody).toEqual({
      name: { firstName: 'Jane', lastName: 'Smith' },
      emails: { primaryEmail: 'jane@company.com' },
      jobTitle: 'TBT contact form — AI & Agents',
      contactMessage: 'Need help with AI agents',
    });
  });

  it('returns 500 when Twenty rejects the Person', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ error: 'nope' }, 400)));
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.55.0.1');
    expect(res.status).toBe(500);
  });

  it('returns 500 when the network fails', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.44.0.1');
    expect(res.status).toBe(500);
  });
});

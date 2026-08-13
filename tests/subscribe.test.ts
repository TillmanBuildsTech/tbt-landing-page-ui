import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST, ALL } from '../src/pages/api/subscribe';
import { MAX_BODY_BYTES, MAX_EMAIL_LENGTH } from '../src/lib/api';

const TWENTY_KEY = 'test-twenty-key';

function post(body: Record<string, string>, ip = '10.0.0.1'): Promise<Response> {
  const data = new FormData();
  for (const [k, v] of Object.entries(body)) data.set(k, v);
  return POST({
    request: new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
      body: data,
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/subscribe', () => {
  it('returns 405 for other methods', async () => {
    const res = await ALL();
    expect(res.status).toBe(405);
  });

  it('returns 500 when TWENTY_API_KEY is not configured', async () => {
    vi.stubEnv('TWENTY_API_KEY', '');
    const res = await post({ email: 'jane@x.com' });
    expect(res.status).toBe(500);
  });

  it('returns 400 for an invalid email', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const res = await post({ email: 'nope' }, '10.88.0.1');
    expect(res.status).toBe(400);
  });

  it('rejects an email over the length cap without calling Twenty', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const longEmail = `${'a'.repeat(MAX_EMAIL_LENGTH)}@x.com`;
    const res = await post({ email: longEmail }, '10.89.0.1');
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized request bodies with 413 before parsing', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost/api/subscribe', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.90.0.1' },
      body: 'x'.repeat(100),
    });
    req.headers.set('content-length', String(MAX_BODY_BYTES + 1));
    const res = await POST({ request: req });
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a fake 200 for honeypot submissions (no Twenty call)', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ email: 'bot@x.com', website: 'http://spam.example' }, '10.87.0.1');
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a newsletter Person in Twenty on success', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { createPerson: { id: 'person-1' } } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await post({ email: 'subscriber@example.com' }, '10.86.0.1');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://crm.tillmanbuildstech.com/rest/people');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      name: { firstName: 'subscriber' },
      emails: { primaryEmail: 'subscriber@example.com' },
      jobTitle: 'TBT newsletter signup',
    });
  });

  it('returns 500 when Twenty rejects the subscription', async () => {
    vi.stubEnv('TWENTY_API_KEY', TWENTY_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
    const res = await post({ email: 'jane@x.com' }, '10.85.0.1');
    expect(res.status).toBe(500);
  });
});

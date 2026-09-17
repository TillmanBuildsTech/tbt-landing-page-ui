import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST, ALL } from '../src/pages/api/subscribe';
import { MAX_BODY_BYTES, MAX_EMAIL_LENGTH } from '../src/lib/api';

const ODOO_KEY = 'test-odoo-key';

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

/** Routes stubbed fetch: Odoo authenticate → uid 2, execute_kw → lead id 7. */
function odooMock() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(((init as RequestInit)?.body as string) ?? '{}');
    const result = body?.params?.service === 'object' ? 7 : 2;
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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

  it('returns 500 when ODOO_API_KEY is not configured', async () => {
    vi.stubEnv('ODOO_API_KEY', '');
    const res = await post({ email: 'jane@x.com' });
    expect(res.status).toBe(500);
  });

  it('returns 400 for an invalid email', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const res = await post({ email: 'nope' }, '10.88.0.1');
    expect(res.status).toBe(400);
  });

  it('rejects an email over the length cap without calling Odoo', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const longEmail = `${'a'.repeat(MAX_EMAIL_LENGTH)}@x.com`;
    const res = await post({ email: longEmail }, '10.89.0.1');
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized request bodies with 413 before parsing', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
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

  it('returns a fake 200 for honeypot submissions (no Odoo call)', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ email: 'bot@x.com', website: 'http://spam.example' }, '10.87.0.1');
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a newsletter Lead in Odoo on success', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const fetchMock = odooMock();
    vi.stubGlobal('fetch', fetchMock);

    const res = await post({ email: 'subscriber@example.com' }, '10.86.0.1');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const createCall = fetchMock.mock.calls.find(([, init]) => {
      try {
        return JSON.parse((((init as RequestInit).body as string) ?? '{}')).params?.service === 'object';
      } catch {
        return false;
      }
    });
    expect(createCall).toBeDefined();
    const [url, init] = createCall!;
    expect(url).toBe('https://odoo.tillmanbuildstech.com/jsonrpc');
    const body = JSON.parse((init as RequestInit).body as string);
    const [, , key, model, method, [lead]] = body.params.args;
    expect(key).toBe(ODOO_KEY);
    expect(model).toBe('crm.lead');
    expect(method).toBe('create');
    expect(lead).toEqual({
      name: 'TBT newsletter — subscriber@example.com',
      contact_name: 'subscriber',
      email_from: 'subscriber@example.com',
      description: 'Newsletter subscription via tillmanbuildstech.com',
    });
  });

  it('returns 500 when Odoo rejects the subscription', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })));
    const res = await post({ email: 'jane@x.com' }, '10.85.0.1');
    expect(res.status).toBe(500);
  });
});

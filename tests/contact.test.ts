import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST, ALL } from '../src/pages/api/contact';
import {
  MAX_BODY_BYTES,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
} from '../src/lib/api';

const ODOO_KEY = 'test-odoo-key';

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

/** Routes stubbed fetch: Odoo authenticate → uid 2, execute_kw → lead id 7, Resend → sent. */
function odooMock() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('api.resend.com')) return okJson({ id: 're_123' });
    const body = JSON.parse((init?.body as string) ?? '{}');
    if (body?.params?.service === 'object') return okJson({ result: 7 });
    return okJson({ result: 2 });
  });
}

/** The execute_kw (lead create) call from the mock's call list. */
function createCall(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(([, init]) => {
    try {
      return JSON.parse(((init as RequestInit).body as string) ?? '{}').params?.service === 'object';
    } catch {
      return false;
    }
  });
  if (!call) throw new Error('no Odoo lead-create call was made');
  return { url: call[0] as string, body: JSON.parse(((call[1] as RequestInit).body as string) ?? '{}') };
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

  it('returns 500 when ODOO_API_KEY is not configured', async () => {
    vi.stubEnv('ODOO_API_KEY', '');
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/misconfig/i);
  });

  it('returns 400 for an invalid request body', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const res = await POST({ request: new Request('http://localhost/api/contact', { method: 'POST' }) });
    expect(res.status).toBe(400);
  });

  it('returns a fake 200 for honeypot submissions (no Odoo call)', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'Bot', email: 'bot@x.com', message: 'spam', website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 429 after the rate limit', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubGlobal('fetch', odooMock());
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
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const res = await post(fields, '10.77.0.1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(errorPattern);
  });

  it('rejects a message over the length cap without calling Odoo', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }, '10.76.0.1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`message must be ${MAX_MESSAGE_LENGTH}`, 'i'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a message at exactly the length cap', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubGlobal('fetch', odooMock());
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'x'.repeat(MAX_MESSAGE_LENGTH) }, '10.75.0.1');
    expect(res.status).toBe(200);
  });

  it('rejects a name over the length cap without calling Odoo', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'J'.repeat(MAX_NAME_LENGTH + 1), email: 'jane@x.com', message: 'hi' }, '10.74.0.1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`name must be ${MAX_NAME_LENGTH}`, 'i'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an email over the length cap without calling Odoo', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
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

  it('rejects an unknown project type without calling Odoo', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
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
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
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
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    const fetchMock = odooMock();
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ name: 'Jane\u0000\u000ASmith', email: 'jane@x.com', message: 'hi' }, '10.70.0.1');
    expect(res.status).toBe(200);
    const { body } = createCall(fetchMock);
    expect(body.params.args[5][0].contact_name).toBe('Jane Smith');
  });

  it('creates a Lead in Odoo on success (no Resend key → no email)', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubEnv('RESEND_API_KEY', '');
    const fetchMock = odooMock();
    vi.stubGlobal('fetch', fetchMock);

    const res = await post(
      { name: 'Jane Smith', email: 'jane@company.com', message: 'Need help with AI agents', project_type: 'ai-agents' },
      '10.66.0.1'
    );

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const { url, body } = createCall(fetchMock);
    expect(url).toBe('https://odoo.tillmanbuildstech.com/jsonrpc');
    expect(body.params.service).toBe('object');
    expect(body.params.method).toBe('execute_kw');
    const [, , key, model, method, [lead]] = body.params.args;
    expect(key).toBe(ODOO_KEY);
    expect(model).toBe('crm.lead');
    expect(method).toBe('create');
    expect(lead).toEqual({
      name: 'TBT contact — Jane Smith',
      contact_name: 'Jane Smith',
      email_from: 'jane@company.com',
      description: 'Project type: AI & Agents\n\nNeed help with AI agents',
    });
    // No Resend key → no email attempt at all.
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('api.resend.com'))).toBe(true);
  });

  it('sends the founder notification email when RESEND_API_KEY is set', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    const fetchMock = odooMock();
    vi.stubGlobal('fetch', fetchMock);

    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.65.0.1');
    expect(res.status).toBe(200);

    const resendCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('api.resend.com'));
    expect(resendCalls).toHaveLength(1);
    // Lead still created.
    expect(() => createCall(fetchMock)).not.toThrow();
  });

  it('still succeeds when the notify email fails after the lead lands', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('api.resend.com')) return new Response('bad', { status: 500 });
      const body = JSON.parse(((init as RequestInit)?.body as string) ?? '{}');
      if (body?.params?.service === 'object') return okJson({ result: 7 });
      return okJson({ result: 2 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.64.0.1');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(() => createCall(fetchMock)).not.toThrow();
  });

  it('returns 500 when Odoo rejects the lead', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ error: { message: 'nope' } }, 400)));
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.55.0.1');
    expect(res.status).toBe(500);
  });

  it('returns 500 when the network fails', async () => {
    vi.stubEnv('ODOO_API_KEY', ODOO_KEY);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));
    const res = await post({ name: 'Jane', email: 'jane@x.com', message: 'hi' }, '10.44.0.1');
    expect(res.status).toBe(500);
  });
});

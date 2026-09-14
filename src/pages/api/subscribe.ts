import type { APIRoute } from 'astro';
import {
  MAX_BODY_BYTES,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  getClientIp,
  isBodyTooLarge,
  isSpamBot,
  isValidEmail,
  jsonResponse,
  subscribeLimiter,
} from '../../lib/api';
import { createLead, getOdooKey } from '../../lib/odoo';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!getOdooKey()) {
    console.error('Missing ODOO_API_KEY');
    return jsonResponse({ error: 'Server misconfiguration.' }, 500);
  }

  // Reject oversized bodies before parsing them.
  if (isBodyTooLarge(request, MAX_BODY_BYTES)) {
    return jsonResponse({ error: 'Request body too large.' }, 413);
  }

  const ip = getClientIp(request);
  if (!subscribeLimiter(ip)) {
    return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429);
  }

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  // Honeypot — fake success so bots don't learn the trap.
  if (isSpamBot(data)) {
    return jsonResponse({ success: true });
  }

  const email = ((data.get('email') as string | null) ?? '').trim();
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 400);
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return jsonResponse({ error: `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.` }, 400);
  }

  try {
    await createLead({
      name: `TBT newsletter — ${email}`,
      contact_name: (email.split('@')[0] || 'Newsletter').slice(0, MAX_NAME_LENGTH),
      email_from: email,
      description: 'Newsletter subscription via tillmanbuildstech.com',
    });
  } catch (err) {
    console.error('Odoo subscribe error:', err);
    return jsonResponse({ error: 'Failed to subscribe. Please try again.' }, 500);
  }

  return jsonResponse({ success: true });
};

export const ALL: APIRoute = () => jsonResponse({ error: 'Method not allowed.' }, 405);

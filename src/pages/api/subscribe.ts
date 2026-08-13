import type { APIRoute } from 'astro';
import {
  getClientIp,
  isSpamBot,
  isValidEmail,
  jsonResponse,
  subscribeLimiter,
} from '../../lib/api';
import { createPerson, getTwentyKey } from '../../lib/twenty';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!getTwentyKey()) {
    console.error('Missing TWENTY_API_KEY');
    return jsonResponse({ error: 'Server misconfiguration.' }, 500);
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

  const email = (data.get('email') as string | null)?.trim() ?? '';
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 400);
  }

  try {
    await createPerson({
      firstName: email.split('@')[0] || 'Newsletter',
      email,
      jobTitle: 'TBT newsletter signup',
    });
  } catch (err) {
    console.error('Twenty subscribe error:', err);
    return jsonResponse({ error: 'Failed to subscribe. Please try again.' }, 500);
  }

  return jsonResponse({ success: true });
};

export const ALL: APIRoute = () => jsonResponse({ error: 'Method not allowed.' }, 405);

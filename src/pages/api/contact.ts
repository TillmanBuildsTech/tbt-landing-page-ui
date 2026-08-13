import type { APIRoute } from 'astro';
import {
  contactLimiter,
  getClientIp,
  isSpamBot,
  isValidEmail,
  jsonResponse,
} from '../../lib/api';
import { addNote, createPerson, getTwentyKey } from '../../lib/twenty';

export const prerender = false;

const PROJECT_TYPE_LABELS: Record<string, string> = {
  'ai-agents': 'AI & Agents',
  automation: 'Automation',
  'web-apps': 'Web & Apps',
  devops: 'DevOps & Infrastructure',
  other: 'Other',
};

export const POST: APIRoute = async ({ request }) => {
  if (!getTwentyKey()) {
    console.error('Missing TWENTY_API_KEY');
    return jsonResponse({ error: 'Server misconfiguration.' }, 500);
  }

  const ip = getClientIp(request);
  if (!contactLimiter(ip)) {
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

  const name = (data.get('name') as string | null)?.trim() ?? '';
  const email = (data.get('email') as string | null)?.trim() ?? '';
  const message = (data.get('message') as string | null)?.trim() ?? '';
  const projectType = (data.get('project_type') as string | null)?.trim() ?? '';

  if (!name) {
    return jsonResponse({ error: 'Name is required.' }, 400);
  }
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 400);
  }
  if (!message) {
    return jsonResponse({ error: 'Message is required.' }, 400);
  }

  const [firstName, ...lastNameParts] = name.split(/\s+/);
  const label = PROJECT_TYPE_LABELS[projectType] ?? projectType;
  const jobTitle = `TBT contact form${label ? ` — ${label}` : ''}`;

  try {
    const person = await createPerson({
      firstName,
      lastName: lastNameParts.join(' '),
      email,
      jobTitle,
    });
    // Best-effort: a note failure must never fail the request.
    await addNote(`TBT contact — ${name} (${email})`, message);
  } catch (err) {
    console.error('Twenty contact error:', err);
    return jsonResponse({ error: 'Failed to send message. Please try again.' }, 500);
  }

  return jsonResponse({ success: true });
};

export const ALL: APIRoute = () => jsonResponse({ error: 'Method not allowed.' }, 405);

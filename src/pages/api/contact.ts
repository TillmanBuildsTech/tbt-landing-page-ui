import type { APIRoute } from 'astro';
import {
  MAX_BODY_BYTES,
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  contactLimiter,
  getClientIp,
  isBodyTooLarge,
  isSpamBot,
  isValidEmail,
  jsonResponse,
  sanitizeText,
} from '../../lib/api';
import { createPerson, getTwentyKey } from '../../lib/twenty';

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

  // Reject oversized bodies before parsing them — a script pushing megabytes
  // of junk never even reaches formData().
  if (isBodyTooLarge(request, MAX_BODY_BYTES)) {
    return jsonResponse({ error: 'Request body too large.' }, 413);
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

  const name = sanitizeText((data.get('name') as string | null) ?? '');
  const email = ((data.get('email') as string | null) ?? '').trim();
  const message = ((data.get('message') as string | null) ?? '').trim();
  const projectType = ((data.get('project_type') as string | null) ?? '').trim();

  if (!name) {
    return jsonResponse({ error: 'Name is required.' }, 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    return jsonResponse({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` }, 400);
  }
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 400);
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return jsonResponse({ error: `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.` }, 400);
  }
  if (!message) {
    return jsonResponse({ error: 'Message is required.' }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` }, 400);
  }
  // Allowlist — browsers only ever send the select's options, so anything
  // else is a script. Stops arbitrary text from reaching the CRM jobTitle.
  if (projectType && !Object.hasOwn(PROJECT_TYPE_LABELS, projectType)) {
    return jsonResponse({ error: 'Invalid project type.' }, 400);
  }

  const [firstName, ...lastNameParts] = name.split(/\s+/);
  const label = PROJECT_TYPE_LABELS[projectType] ?? projectType;
  const jobTitle = `TBT contact form${label ? ` — ${label}` : ''}`;

  try {
    await createPerson({
      firstName,
      lastName: lastNameParts.join(' '),
      email,
      jobTitle,
      contactMessage: message,
    });
  } catch (err) {
    console.error('Twenty contact error:', err);
    return jsonResponse({ error: 'Failed to send message. Please try again.' }, 500);
  }

  return jsonResponse({ success: true });
};

export const ALL: APIRoute = () => jsonResponse({ error: 'Method not allowed.' }, 405);

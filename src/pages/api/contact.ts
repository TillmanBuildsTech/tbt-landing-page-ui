import type { APIRoute } from 'astro';
import { Resend } from 'resend';
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
import { createLead, getOdooKey } from '../../lib/odoo';

export const prerender = false;

const PROJECT_TYPE_LABELS: Record<string, string> = {
  'ai-agents': 'AI & Agents',
  automation: 'Automation',
  'web-apps': 'Web & Apps',
  devops: 'DevOps & Infrastructure',
  other: 'Other',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const POST: APIRoute = async ({ request }) => {
  if (!getOdooKey()) {
    console.error('Missing ODOO_API_KEY');
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
  // else is a script. Stops arbitrary text from reaching the CRM.
  if (projectType && !Object.hasOwn(PROJECT_TYPE_LABELS, projectType)) {
    return jsonResponse({ error: 'Invalid project type.' }, 400);
  }

  const label = PROJECT_TYPE_LABELS[projectType] ?? projectType;

  // The CRM lead is the record of truth — it must land before anything else.
  try {
    await createLead({
      name: `TBT contact — ${name}`,
      contact_name: name,
      email_from: email,
      description: `${label ? `Project type: ${label}\n\n` : ''}${message}`,
    });
  } catch (err) {
    console.error('Odoo contact error:', err);
    return jsonResponse({ error: 'Failed to send message. Please try again.' }, 500);
  }

  // Founder notification email — best effort only. The lead is already safe
  // in Odoo, so a mail failure must not fail the request (that would trigger
  // a retry and a duplicate lead). Skipped when RESEND_API_KEY is unset.
  const resendKey = import.meta.env.RESEND_API_KEY as string | undefined;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const toEmail =
        (import.meta.env.CONTACT_TO_EMAIL as string | undefined) ??
        'contact@tillmanbuildstech.com';
      const { error } = await resend.emails.send({
        from: 'TillmanBuildsTech Contact <noreply@tillmanbuildstech.com>',
        to: toEmail,
        subject: `New project inquiry from ${name}`,
        html: `
      <div style="font-family: sans-serif; max-width: 600px; color: #333;">
        <h2>New project inquiry (also in Odoo CRM)</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold; width: 120px;">Name</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Email</td><td>${escapeHtml(email)}</td></tr>
          ${label ? `<tr><td style="padding: 8px 0; font-weight: bold;">Project type</td><td>${escapeHtml(label)}</td></tr>` : ''}
        </table>
        <hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;" />
        <p style="color: #555; line-height: 1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      </div>
    `,
      });
      if (error) console.error('Resend notify error:', error);
    } catch (err) {
      console.error('Resend notify error:', err);
    }
  }

  return jsonResponse({ success: true });
};

export const ALL: APIRoute = () => jsonResponse({ error: 'Method not allowed.' }, 405);

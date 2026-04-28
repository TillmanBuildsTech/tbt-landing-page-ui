import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const name = (data.get('name') as string | null)?.trim() ?? '';
  const email = (data.get('email') as string | null)?.trim() ?? '';
  const message = (data.get('message') as string | null)?.trim() ?? '';
  const projectType = (data.get('project_type') as string | null)?.trim() ?? '';

  if (!name) {
    return new Response(JSON.stringify({ error: 'Name is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'A valid email address is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const safeProjectType = escapeHtml(projectType);

  const toEmail = import.meta.env.CONTACT_TO_EMAIL ?? 'btillman32@gmail.com';

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: 'TillmanBuildsTech Contact <noreply@tillmanbuildstech.com>',
    to: toEmail,
    subject: `New project inquiry from ${safeName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; color: #333;">
        <h2 style="color: #2ECBA8;">New project inquiry</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold; width: 120px;">Name</td><td>${safeName}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">Email</td><td>${safeEmail}</td></tr>
          ${safeProjectType ? `<tr><td style="padding: 8px 0; font-weight: bold;">Project type</td><td>${safeProjectType}</td></tr>` : ''}
        </table>
        <hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;" />
        <h3 style="margin-bottom: 8px;">Message</h3>
        <p style="color: #555; line-height: 1.6;">${safeMessage}</p>
      </div>
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send message. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Minimal Twenty CRM client (self-hosted REST API) for lead intake.
 *
 * The contact form and newsletter create People directly in Twenty via its
 * public REST API (https://crm.tillmanbuildstech.com/rest/*, Bearer auth).
 * Provenance is tagged on `jobTitle` (free text, searchable) — Twenty v1.x
 * People have no dedicated `source` field.
 *
 * Env (server-only, set in Vercel for preview + production):
 *   TWENTY_API_KEY   — API key from CRM Settings → API & Webhooks
 *   TWENTY_API_BASE  — optional override (defaults to the TBT instance)
 */

const TWENTY_BASE =
  (import.meta.env.TWENTY_API_BASE as string | undefined) ??
  'https://crm.tillmanbuildstech.com';

export function getTwentyKey(): string | undefined {
  return import.meta.env.TWENTY_API_KEY as string | undefined;
}

export interface PersonLead {
  firstName: string;
  lastName?: string;
  email: string;
  jobTitle?: string;
}

/** Create a Person. Returns the Twenty record id. Throws on failure. */
export async function createPerson(lead: PersonLead): Promise<{ id: string }> {
  const apiKey = getTwentyKey();
  if (!apiKey) throw new Error('TWENTY_API_KEY is not configured.');

  const body: Record<string, unknown> = {
    name: {
      firstName: lead.firstName,
      ...(lead.lastName ? { lastName: lead.lastName } : {}),
    },
    emails: { primaryEmail: lead.email },
  };
  if (lead.jobTitle) body.jobTitle = lead.jobTitle;

  const res = await fetch(`${TWENTY_BASE}/rest/people`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twenty createPerson failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { data?: { createPerson?: { id: string } } };
  const id = data?.data?.createPerson?.id;
  if (!id) throw new Error('Twenty createPerson returned no id.');
  return { id };
}

/**
 * Create a Note with the contact message. Best-effort — never throws.
 *
 * Verified 2026-08-13 against crm.tillmanbuildstech.com (Twenty v1.15):
 * Notes accept `title` + `bodyV2.markdown`, but the REST API exposes NO way
 * to link a note to a Person (`personId`/`person`/`people`/`peopleIds` are all
 * rejected, and GraphQL has no createNote mutation). The title therefore
 * embeds the sender's name + email so the note is findable, and a failed note
 * never fails the lead itself.
 */
export async function addNote(title: string, bodyText: string): Promise<void> {
  const apiKey = getTwentyKey();
  if (!apiKey) return;
  try {
    const res = await fetch(`${TWENTY_BASE}/rest/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ title, bodyV2: { markdown: bodyText } }),
    });
    if (!res.ok) {
      console.error('Twenty addNote failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Twenty addNote error:', err);
  }
}

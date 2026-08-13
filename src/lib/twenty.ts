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
  contactMessage?: string;
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
  if (lead.contactMessage) body.contactMessage = lead.contactMessage;

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

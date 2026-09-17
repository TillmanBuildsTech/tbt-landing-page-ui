/**
 * Minimal Odoo CRM client (JSON-RPC) for lead intake.
 *
 * The contact form and newsletter create Leads (`crm.lead`) directly in Odoo
 * via its `/jsonrpc` endpoint: `common.authenticate` (uid is cached per
 * serverless instance) then `object.execute_kw`. New leads land in the
 * default Sales team / New stage. Provenance goes in the lead title and
 * description — crm.lead has no dedicated `source` field.
 *
 * Env (server-only, set in Vercel for preview + production):
 *   ODOO_API_KEY — API key from Odoo Preferences → API Keys (REQUIRED)
 *   ODOO_URL     — optional override (defaults to the TBT instance)
 *   ODOO_DB      — optional override (defaults to tbt-odoo-test)
 *   ODOO_USER    — optional override (defaults to brandon@tillmanbuildstech.com)
 */

import { Agent } from 'undici';

const ODOO_URL =
  (import.meta.env.ODOO_URL as string | undefined) ?? 'https://odoo.tillmanbuildstech.com';
const ODOO_DB = (import.meta.env.ODOO_DB as string | undefined) ?? 'tbt-odoo-test';
const ODOO_USER =
  (import.meta.env.ODOO_USER as string | undefined) ?? 'brandon@tillmanbuildstech.com';

export function getOdooKey(): string | undefined {
  return import.meta.env.ODOO_API_KEY as string | undefined;
}

// TLS — TEMPORARY: Odoo currently serves Traefik's self-signed DEFAULT cert
// (no ACME cert has been issued for the host yet), so Node's fetch rejects
// the chain. Bypass verification for Odoo calls ONLY via a scoped undici
// dispatcher — nothing else in the function is affected. Set
// ODOO_INSECURE_TLS=false once the Traefik cert is fixed (infra backlog).
const INSECURE_TLS =
  ((import.meta.env.ODOO_INSECURE_TLS as string | undefined) ?? 'true') === 'true';
const odooDispatcher = INSECURE_TLS
  ? new Agent({ connect: { rejectUnauthorized: false } })
  : undefined;

/** Single JSON-RPC call. Throws on transport or Odoo-level errors. */
async function jsonRpc(service: string, method: string, args: unknown[]): Promise<unknown> {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: 1,
    }),
    ...(odooDispatcher ? { dispatcher: odooDispatcher } : {}),
  };
  const res = await fetch(`${ODOO_URL}/jsonrpc`, init as RequestInit);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odoo ${service}.${method} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (data.error) {
    throw new Error(`Odoo ${service}.${method}: ${(data.error.message ?? 'unknown error').slice(0, 300)}`);
  }
  return data.result;
}

let uidCache: number | null = null;

/** Authenticate once per instance; the uid is stable per user. */
async function odooUid(apiKey: string): Promise<number> {
  if (!uidCache) {
    const uid = (await jsonRpc('common', 'authenticate', [ODOO_DB, ODOO_USER, apiKey, {}])) as number;
    if (!uid) throw new Error('Odoo authentication failed (bad DB/user/key).');
    uidCache = uid;
  }
  return uidCache;
}

export interface OdooLead {
  name: string;
  email_from?: string;
  contact_name?: string;
  description?: string;
}

/** Create a crm.lead. Returns the Odoo record id. Throws on failure. */
export async function createLead(lead: OdooLead): Promise<{ id: number }> {
  const apiKey = getOdooKey();
  if (!apiKey) throw new Error('ODOO_API_KEY is not configured.');

  const uid = await odooUid(apiKey);
  // NOTE: method args must be wrapped in a list — execute_kw takes
  // (db, uid, key, model, method, args[], kwargs{}). A bare dict errors.
  const id = (await jsonRpc('object', 'execute_kw', [
    ODOO_DB,
    uid,
    apiKey,
    'crm.lead',
    'create',
    [lead],
    {},
  ])) as number;
  if (typeof id !== 'number') throw new Error('Odoo createLead returned no id.');
  return { id };
}

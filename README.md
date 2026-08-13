# TillmanBuildsTech.com

Landing page for [TillmanBuildsTech.com](https://tillmanbuildstech.com) — Brandon Tillman, independent consultant (AI agents, automation, web apps, DevOps).

Built with **Astro 7**, deployed on **Vercel** (`@astrojs/vercel`). Static pages are prerendered; the contact + newsletter forms run as serverless functions.

## Stack

- [Astro](https://astro.build) 7 — static-first, islands-free (progressive enhancement via one shared script)
- [@astrojs/vercel](https://docs.astro.build/en/guides/integrations-guide/vercel/) ^11 (must stay on ^11 — peers astro ^7)
- [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/) — auto-generated sitemap
- [Twenty CRM](https://crm.tillmanbuildstech.com) — contact form + newsletter write leads straight into the CRM (REST, Bearer key)
- [@vercel/analytics](https://vercel.com/docs/analytics) — page-view analytics
- Google Fonts: Fraunces / Plus Jakarta Sans / JetBrains Mono

## Local dev

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # production build → dist/
npm run test       # vitest unit tests (API routes + lib)
```

Requires Node 22 (pinned via `engines`).

## Environment variables

Copy `.env.example` to `.env` for local dev; set the same values in Vercel (Settings → Environment Variables) for **preview and production** — build-time inlining means a missing server var turns the API routes into a permanent 500 stub.

| Variable | Required | Purpose |
|---|---|---|
| `PUBLIC_SITE_URL` | no (defaults to `https://tillmanbuildstech.com`) | Canonical URLs, sitemap, OG tags |
| `PUBLIC_GITHUB_URL` | no | GitHub link (default: `https://github.com/TillmanBuildsTech`) |
| `PUBLIC_LINKEDIN_URL` | no | LinkedIn link (default: `https://www.linkedin.com/in/tillman-brandon/`) |
| `PUBLIC_BLOG_URL` | no | Blog link (default: `https://brandontillman.com`) |
| `TWENTY_API_KEY` | **yes** | Contact form + newsletter delivery (CRM Settings → API & Webhooks) |
| `TWENTY_API_BASE` | no (defaults to TBT instance) | Twenty REST base URL |

> `PUBLIC_`-prefixed vars are inlined into the static build — anything secret must use a non-`PUBLIC_` name.

## API routes

- `POST /api/contact` — validates, rate-limits (5 req / 10 min / IP), honeypot-checks, then creates a **Person** in Twenty (`jobTitle` tags provenance: "TBT contact form — {project type}") and a best-effort Note with the message.
- `POST /api/subscribe` — same defenses, then creates a Person tagged "TBT newsletter signup".

Both endpoints include a hidden honeypot field (`website`) and a per-IP in-memory rate limiter (`src/lib/api.ts`). The limiter is per serverless instance — fine for launch; swap in Vercel KV/Upstash if spam becomes a problem.

## Versioning

- `package.json` version is the release version, displayed in the site footer as `vX.Y.Z` (` · preview` on dev/preview builds). Bump it on every change that ships.
- `.github/workflows/version-guard.yaml` fails any PR to `main` whose version isn't strictly greater than main's (`npm version patch --no-git-tag-version`).

## Deploy & release flow (dev → preview, main → production)

```
feature branch ──PR──▶ dev ──push──▶ Vercel preview (tillman-builds-tech-tillman32.vercel.app)
                        │
                        └─PR──▶ main ──push/merge──▶ Vercel production (tillmanbuildstech.com)
```

- **`dev` is the preview channel** — every push to `dev` (and every non-dev PR) runs `.github/workflows/preview.yaml`: unit tests + build first, then a Vercel preview deploy (remote build).
- **`main` is production** — every push to `main` runs `.github/workflows/deploy.yaml`: unit tests + build first, then `vercel deploy --prod`. Production ships via merged PR (or direct push, owner's call) — never unverified code.
- **Tests block deploys**: both workflows' deploy jobs `needs:` the test job; a failed test suite never reaches Vercel.
- Repo secrets required: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

## Security & SEO

- Security headers (CSP, nosniff, frame-ancestors, referrer policy, permissions policy) via `vercel.json`.
- Open Graph / Twitter cards, canonical URLs, JSON-LD (Person + WebSite), `robots.txt`, auto-generated `sitemap-index.xml`, `404.astro`, `/privacy`.

## Structure

```
src/
  pages/            index, projects, about, services/*, 404, privacy, api/*
  layouts/          BaseLayout (SEO head), ServiceLayout
  components/       Nav, FooterBar
  scripts/main.js   all interactions (8 modules incl. back-to-top)
  lib/api.ts        rate limiter, honeypot, validation
  lib/twenty.ts     Twenty CRM REST client (lead intake)
  styles/global.css design tokens (see DESIGN.md)
tests/              vitest suite (API routes + lib, mocked Twenty)
```

Design system details live in [`DESIGN.md`](./DESIGN.md).

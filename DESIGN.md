# Design Notes — TillmanBuildsTech.com

Current design system and conventions of the landing page (Astro 7). Written 2026-08-08 as the base reference for future work on this repo and for the retro-terminal UI kit idea in `IDEA.md`.

## Design language

**Retro-terminal / CLI aesthetic.** The site speaks in shell: `$`-prefixed CTAs, `//` section labels, `~/` logo, mono-font tags (`ai_agents/`, `automation/`), and a typewriter terminal in the hero. It reads like a developer's personal site but stays warm (cream text on warm near-black, serif display face) rather than cold/green-on-black.

**Three-typeface system** (loaded in `BaseLayout.astro` via Google Fonts):

| Role | Font | Usage |
|---|---|---|
| Display | **Fraunces** (serif, 300–700, opsz 9..144) | Headlines, names, stat numbers |
| Body | **Plus Jakarta Sans** | Paragraphs, cards, form text |
| Mono | **JetBrains Mono** | Labels, buttons, tags, terminal, kickers |

Type hierarchy first: serif for scale, mono for labeling, sans for reading. Mono labels are 10–13px, uppercase, `letter-spacing: 0.1–0.12em`.

## Tokens (`src/styles/global.css:1-27`)

```css
--bg:      #0C0A09;  /* near-black, warm */
--surface: #141210;  /* cards, terminal body */
--text:    #F2EDE7;  /* warm off-white */
--muted:   #7A6F67;  /* warm gray-brown */
--accent:  #2ECBA8;  /* teal — the one accent */
--border:  #232019;  /* section dividers, card borders */
```

- Terminal chrome bar: `#1a1815` (slightly lighter than surface).
- Spacing scale: 8px base → `--space-1..16` = 8/16/24/32/40/48/64/80/96/128px.
- Radii: `--radius-sm: 4px`, `--radius-md: 6px`.
- Container: `max-width: 1160px`, `padding: 0 var(--space-4)`.
- Section rhythm: `padding: var(--space-10/12) 0`, separated by `border-top: 1px solid var(--border)`.
- Dark-only (no light mode).

## Layout / sections (index.astro)

1. **Nav** — fixed 56px, `border-bottom`, solid `--bg`. Logo `<em>~/</em>TillmanBuildsTech`, links (Services, About, Writing), mono `$ contact` CTA (teal outline → teal fill on hover), burger on mobile.
2. **Hero** — 100vh, 55/45 grid: left = kicker `// Solo Expert`, Fraunces headline (`clamp(52px,7vw,88px)`, `-0.02em`), sub + desc, `$ start_a_project` (solid teal) + `See recent work →`. Right = **terminal panel**: traffic-light dots, title `brandon@TillmanBuildsTech ~ zsh`, typewriter body. Background: **glyph lattice** canvas (see Interactions).
3. **Services** — `// Services`, 4-col grid of numbered cards (01–04): name, desc, mono tag (`ai_agents/` etc.), `Read more →` linking to `/services/<slug>`. Cards: surface bg, 1px border, teal border on hover.
4. **Bio** — avatar (56px round, `astro:assets` Image), name/role, bio text, social links (Blog / GitHub / LinkedIn, 13px inline SVGs), stats column right (15+ / Enterprise / Open source) + `Read more →` to /about.
5. **Contact** — 2-col: left = `Let's solve it together.` + contact form (name, email, project-type select, message → `POST /api/contact`); right = newsletter (`POST /api/subscribe`) + `// Quick Links`.
6. **FooterBar** — `© 2026 Brandon Tillman — TillmanBuildsTech.com` + Back to top.

**Sub-pages** all use `BaseLayout` + Nav + FooterBar + `<script> import '../scripts/main.js'` at the bottom:
- `/about` — bio (280px avatar col + text), expertise chip cards (4-col), "The Work" prose, 3-step Process.
- `/work` — 2-col work cards: tag, title, desc, tech chips, client meta, `View case study →` (links are `#` placeholders).
- `/services/*` — via `ServiceLayout.astro` (props: `number, tag, title, headline, description`): header (mono `01 / ai_agents/`, Fraunces headline, desc), then sections — `// What's included` (✓ deliverables list), `// Typical engagement`, `// Technologies` (chips), `// Common use cases` (3-col cards) — then shared `page-cta` (`Ready to start?` + `$ start_a_project`).

## Components (reusable patterns)

- **Buttons**: `.btn-primary` — mono 13px, `--bg` text on `--accent` fill, 10px 20px, radius-sm; hover: `opacity .88`, `translateY(-1px)`. `.btn-ghost` — muted text link. All CTA labels prefixed `$ `.
- **Section labels**: `.section-label` — mono 11px uppercase, `0.12em`, teal, content starts `// `.
- **Chips/tags**: `.tech-chip` (muted mono on `--border` bg) and `.service-card__tag` / `.work-card__tag` (teal on `rgba(46,203,168,.08)`, teal 20%-border).
- **Cards**: surface bg + `--border` 1px + radius-md; hover = border-color teal (+ soft teal glow `0 0 16px rgba(46,203,168,.12)` on work cards).
- **Forms**: mono 10px uppercase labels; inputs surface bg, `--border`, teal on `:focus`; `::placeholder` muted at 60%; submit = `.btn-submit` (same as btn-primary). Inline statuses: teal success `$ message_sent ✓`, `#FF6B6B` errors `$ error — …`.
- **Terminal**: `.hero__terminal` surface + border; `.terminal__chrome` `#1a1815` bar with macOS dots (`#FF5F57 / #FFBD2E / #28CA41`); lines `.term-line`; prompt/checks teal; blinking `.term-cursor` (`blink 1s step-end`).

## Interactions (`src/scripts/main.js` — 7 modules)

1. **Pretext** — elements with `data-pretext` get their final text height from the dynamically imported `/pretext.js` (`prepare(text, font)` + `layout(handle, width, lh)`); waits on `document.fonts.ready`, re-lays out on `ResizeObserver(body)`. Prevents headline reflow as fonts load.
2. **Glyph lattice** — one `<canvas>` behind the hero: glyph chars `░▒▓·∘○◦`, 14px × 22.4px grid, `globalAlpha .18`; glyphs within 160px of the cursor scale/rotate toward it and go teal within 60px. DPR-aware, RAF-throttled, resize-debounced. Skipped if `prefers-reduced-motion` or <768px (CSS dot-grid fallback, `opacity .12`).
3. **Terminal typewriter** — scripted line sequence (cmd → output/✓ checks → gaps → final `available now`), char-by-char (~28ms cmd / 12ms output + jitter, 400ms pause after cmds). Reduced-motion: static pre-rendered terminal.
4. **Mobile nav** — burger toggles `aria-expanded`; menu becomes absolute column under the 56px bar via inline styles.
5. **Entrance fades** — injects `fadeUp` keyframes, animates `.hero__left` / `.hero__terminal` (0.5s, 0.05/0.15s delay) unless reduced-motion.
6. **Contact form** — preventDefault → `fetch POST /api/contact` (FormData) → `$ sending...` / `$ message_sent ✓` / `$ error — …`; disables submit while in flight.
7. **Newsletter form** — same pattern against `/api/subscribe`.

## API endpoints (`src/pages/api/`)

- `contact.ts` — Resend email. Env: `RESEND_API_KEY` (required), `CONTACT_TO_EMAIL` (default `btillman32@gmail.com`). From: `TillmanBuildsTech Contact <noreply@tillmanbuildstech.com>`. Validates name/email (regex)/message, HTML-escapes fields, 400/405/500 JSON errors. `prerender = false`.
- `subscribe.ts` — **placeholder**: validates email, logs it, returns success. TODO comment: wire to Resend Audiences or ConvertKit.

## Accessibility

Semantic landmarks (header/main/footer, `aria-labelledby` per section), `aria-live="polite"` on terminal + form statuses, `role="alert"` statuses, labeled forms, `aria-expanded` burger, `:focus-visible` = 2px teal outline + offset, and full `prefers-reduced-motion` handling (lattice off, static terminal, transitions disabled). Hit targets are compact (some <44px) — noted as a known tradeoff.

## Responsive behavior

- **≤1024px**: services 4→2 col; bio inner 1-col; expertise 4→2 col; stats row.
- **≤768px**: nav links + CTA hidden (burger); hero 1-col; services 2 col; contact 1-col; form-row 1-col; work-grid 1-col; about-bio 1-col; process 1-col; use-cases 1-col; lattice → dot-grid fallback.
- **≤480px**: services 1-col; hero CTAs column; stats column; newsletter form column; expertise 2-col.

## Conventions & pitfalls

- BEM-ish naming: `block__element--modifier`. Section comments use `═══` (CSS) / `───` (Astro) box dividers.
- Every page includes `<script> import '../scripts/main.js' </script>` — no component-level scripts.
- Images via `astro:assets` `<Image>` (avatar 112px hero / 200px about); source `src/images/brandon-tillman.png` (a commented-out `-tbt` variant exists).
- `public/pretext.js` is a vendored text-layout lib, `modulepreload`'d in BaseLayout; the hero headline depends on it — don't inline/rename it without touching `main.js` (dynamic `import(new URL('/pretext.js', location.origin))`).
- **Dependency trap**: `@astrojs/vercel@^8` peers `astro@^5` → `npm install` ERESOLVE with `astro@7`. Must stay on `@astrojs/vercel@^11` (peers astro ^7). Fixed 2026-08-08.
- Node >=22.12 required. Build: `npm run build` (prerenders 7 routes + Vercel serverless function).
- Color literals that intentionally live outside tokens: terminal dots, `#4FC3A1` detail green, `#FF6B6B` error, `rgba(46,203,168,…)` accent tints, `#1a1815` chrome.

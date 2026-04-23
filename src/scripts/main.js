// ── 1. PRETEXT — dynamic text height ────────────────────────────
let prepare, layout;

const pretextEls = document.querySelectorAll('[data-pretext]');
const prepared   = new Map();

async function initPretext() {
  if (!prepare || !layout) {
    try {
      const mod = await import(/* @vite-ignore */ new URL('/pretext.js', location.origin).href);
      prepare = mod.prepare;
      layout = mod.layout;
    } catch (e) {
      console.error('Failed to load pretext.js', e);
      return;
    }
  }
  await document.fonts.ready;
  for (const el of pretextEls) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const font = getComputedStyle(el).font;
    prepared.set(el, prepare(text, font));
  }
  relayout();
}

function relayout() {
  for (const [el, handle] of prepared) {
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const { height } = layout(handle, el.clientWidth, lh);
    if (height > 0) el.style.minHeight = `${height}px`;
  }
}

new ResizeObserver(() => relayout()).observe(document.body);
initPretext();

// ── 2. GLYPH LATTICE ────────────────────────────────────────────
const lattice    = document.getElementById('glyph-lattice');
const glyphChars = '░░░▒▒▓·∘○◦';
const CHAR_W     = 14;
const CHAR_H     = CHAR_W * 1.6;
let glyphSpans   = [];
let mouseX       = -9999;
let mouseY       = -9999;
let rafScheduled = false;

function buildLattice() {
  lattice.innerHTML = '';
  glyphSpans = [];
  // Use the element's own clientWidth/clientHeight — the actual pixel size of the
  // container — so the JS coordinate grid exactly matches the DOM layout.
  const w    = lattice.clientWidth  || window.innerWidth;
  const h    = lattice.clientHeight || window.innerHeight;
  const cols = Math.ceil(w / CHAR_W) + 1;
  const rows = Math.ceil(h / CHAR_H) + 1;
  const frag = document.createDocumentFragment();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const span = document.createElement('span');
      span.textContent = glyphChars[Math.floor(Math.random() * glyphChars.length)];
      // Position each glyph exactly — no flex, no sub-pixel drift
      span.style.left = (c * CHAR_W) + 'px';
      span.style.top  = (r * CHAR_H) + 'px';
      span.dataset.c  = c;
      span.dataset.r  = r;
      frag.appendChild(span);
      glyphSpans.push(span);
    }
  }
  lattice.appendChild(frag);
}

function updateLattice() {
  rafScheduled = false;
  const rect  = lattice.getBoundingClientRect();
  const relX  = mouseX - rect.left;
  const relY  = mouseY - rect.top;
  const radius = 160;
  const tealR  = 60;
  for (const span of glyphSpans) {
    const cx   = +span.dataset.c * CHAR_W + CHAR_W / 2;
    const cy   = +span.dataset.r * CHAR_H + CHAR_H / 2;
    const dx   = cx - relX;
    const dy   = cy - relY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < radius) {
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const str   = 1 - dist / radius;
      span.style.transform = `rotate(${angle}deg) scale(${1 + str * 0.15})`;
      if (dist < tealR) {
        const t = 1 - dist / tealR;
        span.style.color   = `rgba(46, 203, 168, ${t * 0.8 + 0.2})`;
        span.style.opacity = '1';
      } else {
        span.style.color   = '';
        span.style.opacity = '';
      }
    } else {
      span.style.transform = '';
      span.style.color     = '';
      span.style.opacity   = '';
    }
  }
}

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(updateLattice);
  }
});

// Reset glyphs when mouse leaves the hero so they don't freeze mid-transform
const heroEl = document.querySelector('.hero');
if (heroEl) {
  heroEl.addEventListener('mouseleave', () => {
    mouseX = -9999;
    mouseY = -9999;
    for (const span of glyphSpans) {
      span.style.transform = '';
      span.style.color     = '';
      span.style.opacity   = '';
    }
  });
}

let resizeDebounce;
window.addEventListener('resize', () => {
  clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(buildLattice, 120);
});

// Don't build lattice on mobile (saves battery, invisible anyway)
if (window.matchMedia('(min-width: 768px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  buildLattice();
}

// ── 3. TERMINAL TYPEWRITER ───────────────────────────────────────
const termBody = document.getElementById('terminal-body');
const terminalHost = 'brandon@tbt';
if (termBody && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lines = [
    { type: 'cmd',   text: `${terminalHost} ~ $ ls capabilities/` },
    { type: 'out',   text: 'ai_agents/  automation/  web_apps/  devops/' },
    { type: 'gap' },
    { type: 'cmd',   text: `${terminalHost} ~ $ building AI agents...` },
    { type: 'check', text: '✓ LLM pipelines, RAG, agents, skills, mcp' },
    { type: 'check', text: '✓ CoPilot · Anthropic · OpenAi & local models' },
    { type: 'gap' },
    { type: 'cmd',   text: `${terminalHost} ~ $ shipping automation...` },
    { type: 'check', text: '✓ GitHub Actions · Custom Integrations · n8n' },
    { type: 'check', text: '✓ AI driven, custom workflows, manual tasks' },
    { type: 'gap' },
    { type: 'cmd',   text: `${terminalHost} ~ $ deploying infrastructure...` },
    { type: 'check', text: '✓ Docker · Vercel · AWS · GCP · Azure' },
    { type: 'check', text: '✓ Zero-downtime, IaC, Scalable' },
    { type: 'gap' },
    { type: 'final', text: `${terminalHost} ~ $ available now` },
  ];
  let lineIdx = 0, charIdx = 0, curEl = null, cursor = null;

  function addCursor() {
    if (cursor) cursor.remove();
    cursor = document.createElement('span');
    cursor.className = 'term-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    termBody.appendChild(cursor);
  }

  function getLineClass(type) {
    if (type === 'cmd' || type === 'final') return 'term-line term-cmd';
    if (type === 'check') return 'term-line term-detail';
    return 'term-line term-out';
  }

  function typeLine() {
    if (lineIdx >= lines.length) { addCursor(); return; }
    const line = lines[lineIdx];
    if (line.type === 'gap') {
      const br = document.createElement('div');
      br.style.height = '6px';
      termBody.insertBefore(br, cursor);
      lineIdx++;
      setTimeout(typeLine, 80);
      return;
    }
    if (!curEl) {
      curEl = document.createElement('div');
      curEl.className = getLineClass(line.type);
      termBody.insertBefore(curEl, cursor);
    }
    if (charIdx < line.text.length) {
      curEl.textContent = line.text.slice(0, charIdx + 1);
      charIdx++;
      setTimeout(typeLine, (line.type === 'cmd' ? 28 : 12) + Math.random() * 15);
    } else {
      charIdx = 0; curEl = null; lineIdx++;
      setTimeout(typeLine, line.type === 'cmd' ? 400 : 80);
    }
  }

  addCursor();
  setTimeout(typeLine, 800);
} else if (termBody) {
  termBody.innerHTML = `
    <div class="term-line term-cmd">${terminalHost} ~ $ ls capabilities/</div>
    <div class="term-line term-out">ai_agents/  automation/  web_apps/  devops/</div>
    <div style="height:6px"></div>
    <div class="term-line term-cmd">${terminalHost} ~ $ building AI agents...</div>
    <div class="term-line term-detail">✓ LLM pipelines, RAG, skills, mcp</div>
    <div class="term-line term-detail">✓ CoPilot &middot; Anthropic &middot; OpenAi &amp; local models</div>
    <div style="height:6px"></div>
    <div class="term-line term-cmd">${terminalHost} ~ $ shipping automation...</div>
    <div class="term-line term-detail">✓ GitHub Actions &middot; Custom Integrations &middot; n8n</div>
    <div class="term-line term-detail">✓ AI driven, custom workflows, manual tasks</div>
    <div style="height:6px"></div>
    <div class="term-line term-cmd">${terminalHost} ~ $ deploying infrastructure...</div>
    <div class="term-line term-detail">✓ Docker &middot; Vercel &middot; AWS &middot; GCP &middot; Azure</div>
    <div class="term-line term-detail">✓ Zero-downtime, IaC, Scalable</div>
    <div style="height:6px"></div>
    <div class="term-line term-cmd">${terminalHost} ~ $ available now<span class="term-cursor" aria-hidden="true"></span></div>
  `;
}

// ── 4. MOBILE NAV ───────────────────────────────────────────────
const burger  = document.getElementById('nav-burger');
const navList = document.querySelector('.nav__links');
if (burger && navList) {
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!open));
    if (!open) {
      Object.assign(navList.style, {
        display: 'flex', flexDirection: 'column', position: 'absolute',
        top: '56px', left: '0', right: '0', background: 'var(--surface)',
        borderBottom: '1px solid var(--border)', padding: '16px 32px',
        gap: '20px', zIndex: '99',
      });
    } else {
      navList.removeAttribute('style');
    }
  });
}

// ── 5. ENTRANCE FADES ───────────────────────────────────────────
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .hero__left     { animation: fadeUp 0.5s ease 0.05s both; }
    .hero__terminal { animation: fadeUp 0.5s ease 0.15s both; }
  `;
  document.head.appendChild(style);
}

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

// ── 2. GLYPH LATTICE (canvas) ────────────────────────────────────
// Rendered on a single <canvas> instead of hundreds of DOM spans so that
// mouse-move updates and window-resize redraws are pure pixel operations
// with no layout/paint cost.
const latticeEl = document.getElementById('glyph-lattice');

if (latticeEl &&
    window.matchMedia('(min-width: 768px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {

  const canvas  = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  canvas.setAttribute('aria-hidden', 'true');
  latticeEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const GLYPH_CHARS = ['░','░','░','▒','▒','▓','·','∘','○','◦'];
  const CHAR_W  = 14;
  const CHAR_H  = CHAR_W * 1.6;   // ~22.4 px
  const RADIUS  = 160;
  const TEAL_R  = 60;
  // Base glyph colour — matches CSS var(--muted); globalAlpha 0.18 is applied
  // at draw time so the teal highlight's own alpha is also damped to match the
  // original container opacity: 0.18 behaviour exactly.
  const BASE_COLOR = '#7A6F67';

  let glyphs = [];
  let mouseX = -9999, mouseY = -9999;
  let rafId  = null;

  function buildGlyphs() {
    glyphs = [];
    const cols = Math.ceil(canvas.width  / CHAR_W) + 1;
    const rows = Math.ceil(canvas.height / CHAR_H) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        glyphs.push({
          char: GLYPH_CHARS[Math.floor(Math.random() * GLYPH_CHARS.length)],
          x: c * CHAR_W + CHAR_W / 2,
          y: r * CHAR_H + CHAR_H / 2,
        });
      }
    }
  }

  function setSize() {
    // Use device pixel ratio for crisp text on HiDPI screens
    const dpr  = window.devicePixelRatio || 1;
    const rect = latticeEl.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    buildGlyphs();
  }

  function draw() {
    rafId = null;
    const W = canvas.width  / (window.devicePixelRatio || 1);
    const H = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${CHAR_W}px var(--font-mono, monospace)`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Mirror the original CSS `opacity: 0.18` on the container — this multiplies
    // with each glyph's own fillStyle alpha, so the teal highlight is properly
    // dampened to match how it looked before.
    ctx.globalAlpha = 0.18;

    const rect = latticeEl.getBoundingClientRect();
    const relX = mouseX - rect.left;
    const relY = mouseY - rect.top;

    for (const g of glyphs) {
      const dx   = g.x - relX;
      const dy   = g.y - relY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      ctx.save();
      ctx.translate(g.x, g.y);

      if (dist < RADIUS) {
        const str   = 1 - dist / RADIUS;
        const sc    = 1 + str * 0.15;
        const angle = Math.atan2(dy, dx);
        // Rotate FIRST so the coordinate frame is already tilted, then stretch
        // tall in that local space — this rotates a rigid tall rectangle without
        // any skew. Reversing the order (scale then rotate) shears the axes and
        // turns glyphs into parallelograms / triangles.
        ctx.rotate(angle);
        ctx.scale(sc, sc * CHAR_H / CHAR_W);

        if (dist < TEAL_R) {
          const t = 1 - dist / TEAL_R;
          ctx.fillStyle = `rgba(46,203,168,${(t * 0.8 + 0.2)})`;
        } else {
          ctx.fillStyle = BASE_COLOR;
        }
      } else {
        // Resting glyphs: just stretch tall in screen space
        ctx.scale(1, CHAR_H / CHAR_W);
        ctx.fillStyle = BASE_COLOR;
      }

      ctx.fillText(g.char, 0, 0);
      ctx.restore();
    }
  }

  function scheduleRedraw() {
    if (!rafId) rafId = requestAnimationFrame(draw);
  }

  // Mouse tracking
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    scheduleRedraw();
  });

  // Reset when mouse leaves the hero
  const heroEl = document.querySelector('.hero');
  if (heroEl) {
    heroEl.addEventListener('mouseleave', () => {
      mouseX = -9999;
      mouseY = -9999;
      scheduleRedraw();
    });
  }

  // Resize — cancel any in-flight RAF first so it can't race with setSize()
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    resizeTimer = setTimeout(() => { setSize(); scheduleRedraw(); }, 150);
  });

  setSize();
  scheduleRedraw();
}

// ── 3. TERMINAL TYPEWRITER ───────────────────────────────────────
const termBody = document.getElementById('terminal-body');
const terminalHost = 'brandon@TillmanBuildsTech';
if (termBody && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lines = [
    { type: 'cmd',   text: `${terminalHost} ~ $ ls capabilities/` },
    { type: 'out',   text: 'ai/  automation/  fullstack/  devops/' },
    { type: 'gap' },
    { type: 'cmd',   text: `${terminalHost} ~ $ building AI agents...` },
    { type: 'check', text: '✓ agents, skills, mcp, workflows' },
    { type: 'check', text: '✓ Claude · CoPilot · OpenAi & local models' },
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
    <div class="term-line term-out">ai/  automation/  fullstack/  devops/</div>
    <div style="height:6px"></div>
    <div class="term-line term-cmd">${terminalHost} ~ $ building AI...</div>
    <div class="term-line term-detail">✓ agents, skills, mcps, pipelines</div>
    <div class="term-line term-detail">✓ Claude &middot; CoPilot &middot; OpenAi &amp; local models</div>
    <div style="height:6px"></div>
    <div class="term-line term-cmd">${terminalHost} ~ $ shipping automation...</div>
    <div class="term-line term-detail">✓ GitHub Actions &middot; Custom Integrations &middot; n8n</div>
    <div class="term-line term-detail">✓ AI driven, custom workflows, manual tasks</div>
    <div style="height:6px"></div>
    <div class="term-line term-cmd">${terminalHost} ~ $ deploying infra...</div>
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

// ── 6. CONTACT FORM ─────────────────────────────────────────────
const contactForm   = document.getElementById('contact-form');
const formStatus    = document.getElementById('form-status');
const messageInput  = document.getElementById('message');
const messageCount  = document.getElementById('message-count');
if (contactForm && formStatus) {
  // Live char counter. Source of truth for the cap is the textarea's
  // maxlength attribute — keeps UI, JS, and server in lockstep.
  if (messageInput && messageCount) {
    const maxLen = messageInput.maxLength || 0;
    const updateCount = () => {
      const len = messageInput.value.length;
      messageCount.textContent = `${len} / ${maxLen}`;
      messageCount.classList.toggle('is-at-limit', len >= maxLen);
      messageCount.classList.toggle('is-near-limit', len >= Math.floor(maxLen * 0.9));
    };
    messageInput.addEventListener('input', updateCount);
    contactForm.addEventListener('reset', () => {
      messageCount.textContent = `0 / ${maxLen}`;
      messageCount.classList.remove('is-near-limit', 'is-at-limit');
    });
    updateCount();
  }

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('[type="submit"]');
    const originalText = submitBtn.textContent;
    const message = (messageInput?.value ?? '').trim();
    if (message.length > (messageInput?.maxLength || 0)) {
      formStatus.style.color = '#FF6B6B';
      formStatus.textContent = `$ error — message too long (max ${messageInput?.maxLength})`;
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = '$ sending...';
    formStatus.textContent = '';

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        body: new FormData(contactForm),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        formStatus.style.color = 'var(--accent)';
        formStatus.textContent = '$ message_sent ✓';
        contactForm.reset();
      } else {
        formStatus.style.color = '#FF6B6B';
        formStatus.textContent = `$ error — ${json.error ?? 'please try again'}`;
      }
    } catch {
      formStatus.style.color = '#FF6B6B';
      formStatus.textContent = '$ error — please try again';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

// ── 7. NEWSLETTER FORM ───────────────────────────────────────────
const newsletterForm   = document.getElementById('newsletter-form');
const newsletterStatus = document.getElementById('newsletter-status');
if (newsletterForm && newsletterStatus) {
  newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = newsletterForm.querySelector('[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'subscribing...';
    newsletterStatus.textContent = '';

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        body: new FormData(newsletterForm),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        newsletterStatus.style.color = 'var(--accent)';
        newsletterStatus.textContent = '$ subscribed ✓';
        newsletterForm.reset();
      } else {
        newsletterStatus.style.color = '#FF6B6B';
        newsletterStatus.textContent = `$ error — ${json.error ?? 'please try again'}`;
      }
    } catch {
      newsletterStatus.style.color = '#FF6B6B';
      newsletterStatus.textContent = '$ error — please try again';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

// ── 8. BACK TO TOP ─────────────────────────────────────────────
document.querySelectorAll('[data-back-to-top]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

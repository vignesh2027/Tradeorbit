/* =====================================================
   MAIN.JS — Orchestration: intro → sections → data
   ===================================================== */
import { initIntro }    from './intro.js';
import { initGlobe }    from './globe.js';
import { initNewsroom } from './newsroom.js';
import { initTrading, buildTickerTrack } from './trading.js';

async function boot() {
  // 1. Run the 25-second cinematic intro
  await initIntro();

  // 2. Reveal nav, tickers, main content
  const reveal = ['main-nav','ticker-top','ticker-bottom','main-content'];
  reveal.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      el.style.opacity = '0';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.8s ease';
        el.style.opacity    = '1';
      });
    }
  });

  // 3. Start the clock
  startClock();

  // 4. Build empty ticker tracks
  buildTickerTrack();

  // 5. Initialize all sections (in parallel for speed)
  await Promise.allSettled([
    new Promise(r => { initGlobe();    r(); }),
    new Promise(r => { initNewsroom(); r(); }),
    new Promise(r => { initTrading();  r(); }),
  ]);

  // 6. Set up scroll-triggered section animations
  setupIntersectionObserver();

  // 7. Nav smooth-scroll + active link
  setupNav();
}

// ── Clock ─────────────────────────────────────────────
function startClock() {
  function tick() {
    const el = document.getElementById('nav-time');
    if (el) {
      el.textContent = new Date().toUTCString().slice(17, 25) + ' UTC';
    }
  }
  tick();
  setInterval(tick, 1000);
}

// ── Section reveal on scroll ──────────────────────────
function setupIntersectionObserver() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.section').forEach(s => observer.observe(s));

  // Trigger first section immediately (it's visible on load)
  const earthSection = document.getElementById('earth-section');
  if (earthSection) {
    setTimeout(() => earthSection.classList.add('in-view'), 100);
  }
}

// ── Nav ───────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('#nav-links a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.section + '-section') ||
                     document.querySelector(a.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Highlight active section on scroll
  const sections = document.querySelectorAll('.section');
  const links    = document.querySelectorAll('#nav-links a');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 120) current = s.id.replace('-section','');
    });
    links.forEach(l => {
      l.style.color = l.dataset.section === current
        ? 'var(--blue-bright)'
        : '';
      l.style.textShadow = l.dataset.section === current
        ? 'var(--glow-blue)'
        : '';
    });
  }, { passive: true });
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

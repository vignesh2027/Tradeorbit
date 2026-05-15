/* =====================================================
   INTRO.JS — 25-second cinematic opening sequence
   ===================================================== */

const LOGO_LETTERS = 'TRADEORBIT'.split('');

// Pre-generated seeded crack paths so they don't flicker
const CRACK_SEED = 42;
let crackPaths = [];

function seededRand(n) {
  const x = Math.sin(n + CRACK_SEED) * 43758.5453;
  return x - Math.floor(x);
}

function buildCrackPaths(cx, cy, w, h) {
  crackPaths = [];
  const numMain = 8;
  for (let c = 0; c < numMain; c++) {
    const angle = (c / numMain) * Math.PI * 2;
    const path = [{ x: cx, y: cy }];
    let x = cx, y = cy, a = angle;
    for (let i = 0; i < 12; i++) {
      a += (seededRand(c * 100 + i) - 0.5) * 0.7;
      const len = 50 + seededRand(c * 200 + i) * 90;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      path.push({ x, y });
      // Sub-branch at segment 4
      if (i === 4) {
        const bPath = [{ x, y }];
        let bx = x, by = y, ba = a + (seededRand(c * 400 + i) > 0.5 ? 0.6 : -0.6);
        for (let j = 0; j < 6; j++) {
          ba += (seededRand(c * 500 + j) - 0.5) * 0.6;
          const bl = 35 + seededRand(c * 600 + j) * 60;
          bx += Math.cos(ba) * bl;
          by += Math.sin(ba) * bl;
          bPath.push({ x: bx, y: by });
        }
        crackPaths.push(bPath);
      }
    }
    crackPaths.push(path);
  }
}

export function initIntro() {
  return new Promise(resolve => {
    const canvas  = document.getElementById('intro-canvas');
    const overlay = document.getElementById('intro-overlay');
    const ctx     = canvas.getContext('2d');

    let w, h, cx, cy;
    let particles = [];
    let phase       = 'black';   // black → dot → explode → network → spiral → crack → done
    let phaseTime   = 0;
    let dotRadius   = 0;
    let dotPulseT   = 0;
    let crackProg   = 0;
    let fadeAlpha   = 1;
    let raf;

    const resize = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
      cx = w / 2; cy = h / 2;
      buildCrackPaths(cx, cy, w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Particles ──────────────────────────────────
    function spawnParticles() {
      particles = [];
      const count = Math.min(600, Math.floor(w * h / 4000));
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        const dist  = 150 + Math.random() * Math.min(w, h) * 0.45;
        const isBlue  = Math.random() > 0.35;
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          tx: cx + Math.cos(angle) * dist,
          ty: cy + Math.sin(angle) * dist,
          size: 0.8 + Math.random() * 1.8,
          alpha: 0,
          hue: isBlue ? (190 + Math.random() * 30) : (140 + Math.random() * 20),
          sat: 90 + Math.random() * 10,
          lit: 60 + Math.random() * 30,
        });
      }
    }

    function updateParticlesExplode() {
      particles.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vx *= 0.984;
        p.vy *= 0.984;
        p.alpha = Math.min(1, p.alpha + 0.04);
      });
    }

    function updateParticlesSpiral(progress) {
      const pullStrength = 0.006 + progress * 0.025;
      particles.forEach(p => {
        const dx   = cx - p.x;
        const dy   = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 6) { p.alpha = 0; return; }
        const ang = Math.atan2(dy, dx) + 0.06;
        p.vx += Math.cos(ang) * pullStrength + dx * 0.0012;
        p.vy += Math.sin(ang) * pullStrength + dy * 0.0012;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x  += p.vx;
        p.y  += p.vy;
        p.alpha = Math.max(0, p.alpha - progress * 0.003);
      });
    }

    function drawParticles() {
      particles.forEach(p => {
        if (p.alpha <= 0) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.lit}%,${p.alpha})`;
        ctx.fill();
      });
    }

    function drawNetwork() {
      const maxD = 110;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i], p2 = particles[j];
          const dx = p1.x - p2.x, dy = p1.y - p2.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxD * maxD) {
            const a = (1 - Math.sqrt(d2) / maxD) * 0.22 * Math.min(p1.alpha, p2.alpha);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(0,180,216,${a})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    // ── Logo builder ───────────────────────────────
    function buildLogo() {
      const container = document.getElementById('logo-letters');
      container.innerHTML = '';
      LOGO_LETTERS.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch;
        container.appendChild(span);
        const delay = i * 320;
        setTimeout(() => {
          span.classList.add('visible');
          playClick();
          if (i === LOGO_LETTERS.length - 1) {
            span.classList.add('flash');
            document.getElementById('logo-tagline').classList.add('visible');
          }
        }, delay);
      });
    }

    // ── Number roll-up ─────────────────────────────
    function rollNumber(elId, target, duration, prefix = '', suffix = '') {
      const el = document.getElementById(elId);
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const val = eased * target;
        if (elId === 'stat-volume') {
          el.textContent = prefix + '$' + val.toFixed(1) + 'T';
        } else {
          el.textContent = prefix + Math.round(val) + suffix;
        }
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    // ── Crack drawing ──────────────────────────────
    function drawCracks(progress) {
      if (progress <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineCap = 'round';
      crackPaths.forEach((path, pi) => {
        const pDelay = pi * 0.07;
        const pProg  = Math.max(0, Math.min(1, (progress - pDelay) / (1 - pDelay)));
        if (pProg <= 0) return;
        const numPts = Math.floor(pProg * (path.length - 1)) + 1;
        const frac   = (pProg * (path.length - 1)) % 1;
        ctx.lineWidth = 2 + (1 - pProg) * 4;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < numPts; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        if (numPts < path.length) {
          const p1 = path[numPts - 1], p2 = path[numPts];
          ctx.lineTo(p1.x + (p2.x - p1.x) * frac, p1.y + (p2.y - p1.y) * frac);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // ── Click sound (Web Audio API) ─────────────────
    let audioCtx = null;
    function getAudio() {
      if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
      }
      return audioCtx;
    }
    function playClick() {
      const ac = getAudio();
      if (!ac) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.setValueAtTime(800 + Math.random() * 400, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
      osc.start(); osc.stop(ac.currentTime + 0.12);
    }

    // ── Main timeline ──────────────────────────────
    let startTime = null;
    let logoStarted    = false;
    let statsStarted   = false;
    let spiralStarted  = false;
    let crackStarted   = false;
    let doneTriggered  = false;

    function tick(ts) {
      if (!startTime) startTime = ts;
      const t = ts - startTime; // ms elapsed

      // Fill background (varies by phase)
      if (phase !== 'crack' && phase !== 'fade') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Phase: black (0 – 1000ms)
      if (t < 1000) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

      // Phase: dot pulse (1000 – 2000ms)
      } else if (t < 2000) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        const dt = t - 1000;
        dotRadius = Math.min(8, dt * 0.012);
        const pulse = Math.sin(dt * 0.005) * 0.5 + 0.5;
        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius * (1 + pulse * 3), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,136,${(1 - pulse) * 0.3})`;
        ctx.fill();
        // Core dot
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;

      // Phase: explode + network (2000 – 10000ms)
      } else if (t < 10000) {
        if (particles.length === 0) spawnParticles();
        updateParticlesExplode();
        drawParticles();
        if (t > 3500) drawNetwork();

        if (!logoStarted && t > 4500) {
          logoStarted = true;
          buildLogo();
        }
        if (!statsStarted && t > 6500) {
          statsStarted = true;
          document.getElementById('intro-stats').classList.add('visible');
          rollNumber('stat-volume',   32.4, 2800, '', 'T');
          rollNumber('stat-countries', 195, 2400);
          rollNumber('stat-ports',     847, 2200);
        }

      // Phase: spiral (10000 – 18500ms)
      } else if (t < 18500) {
        if (!spiralStarted) { spiralStarted = true; }
        const sp = (t - 10000) / 8500;
        updateParticlesSpiral(sp);
        drawParticles();

      // Phase: crack (18500 – 22000ms)
      } else if (t < 22000) {
        if (!crackStarted) {
          crackStarted = true;
          // Fade out overlay text
          overlay.style.transition = 'opacity 2s ease';
          overlay.style.opacity = '0';
        }
        crackProg = (t - 18500) / 3500;

        // Flash white at crack start
        if (crackProg < 0.05) {
          const flashA = 1 - (crackProg / 0.05);
          ctx.fillStyle = `rgba(200,240,255,${flashA * 0.6})`;
          ctx.fillRect(0, 0, w, h);
        }

        drawCracks(Math.min(1, crackProg));

      // Phase: fade (22000 – 25000ms)
      } else {
        fadeAlpha = Math.max(0, 1 - (t - 22000) / 3000);
        drawCracks(1);
        if (!doneTriggered && fadeAlpha < 0.05) {
          doneTriggered = true;
          canvas.style.transition = 'opacity 0.6s';
          canvas.style.opacity = '0';
          setTimeout(() => {
            canvas.style.display  = 'none';
            overlay.style.display = 'none';
            resolve();
          }, 650);
        }
      }

      if (!doneTriggered) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
  });
}

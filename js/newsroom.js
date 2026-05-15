/* =====================================================
   NEWSROOM.JS — Live trade news with sentiment gauge,
   animated card dealing, keyword filter
   ===================================================== */
import { CONFIG, TRADE_KEYWORDS } from './config.js';

let allArticles  = [];
let prevArticles = [];
let sentimentVal = 50;
let filterKw     = null;
let lastFetch    = 0;
const STALE_MS   = 3 * 60 * 1000; // 3 minutes → amber

export async function initNewsroom() {
  document.getElementById('news-refresh-btn').addEventListener('click', refreshNews);
  document.getElementById('clear-keyword').addEventListener('click', clearFilter);
  await fetchNews();
  setInterval(silentRefresh, 5 * 60 * 1000);
  setInterval(checkStale, 30000);
}

async function fetchNews() {
  setRefreshLoading(true);
  try {
    const [gArticles, ndArticles] = await Promise.allSettled([
      fetchGNews(),
      fetchNewsdata(),
    ]);
    const combined = [
      ...(gArticles.status  === 'fulfilled' ? gArticles.value  : []),
      ...(ndArticles.status === 'fulfilled' ? ndArticles.value : []),
    ];
    if (combined.length === 0) {
      // Use placeholder if APIs are rate-limited
      showPlaceholderNews();
      return;
    }
    prevArticles = allArticles;
    allArticles  = dedupeAndSort(combined);
    sentimentVal = calcSentiment(allArticles);
    lastFetch    = Date.now();
    renderAll();
  } catch (e) {
    console.warn('News fetch error:', e);
    if (allArticles.length === 0) showPlaceholderNews();
  } finally {
    setRefreshLoading(false);
  }
}

async function fetchGNews() {
  const q   = encodeURIComponent('trade tariffs exports sanctions shipping supply chain');
  const url = `${CONFIG.gnews.base}/search?q=${q}&lang=en&max=10&apikey=${CONFIG.gnews.apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('GNews ' + res.status);
  const data = await res.json();
  return (data.articles || []).map(a => ({
    title:       a.title,
    description: a.description || '',
    url:         a.url,
    source:      a.source?.name || 'GNews',
    publishedAt: a.publishedAt,
    category:    classifyCategory(a.title + ' ' + (a.description || '')),
  }));
}

async function fetchNewsdata() {
  const url = `${CONFIG.newsdata.base}/news?apikey=${CONFIG.newsdata.apiKey}&q=trade&language=en&category=business,politics`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Newsdata ' + res.status);
  const data = await res.json();
  return (data.results || []).map(a => ({
    title:       a.title,
    description: a.description || a.content || '',
    url:         a.link,
    source:      a.source_id || 'Newsdata',
    publishedAt: a.pubDate,
    category:    classifyCategory(a.title + ' ' + (a.description || '')),
  }));
}

function classifyCategory(text) {
  const t = text.toLowerCase();
  if (/tariff|sanction|wto|trade war|embargo|duty|bilateral/.test(t))  return 'policy';
  if (/oil|gas|opec|energy|brent|crude|lng|pipeline/.test(t))          return 'energy';
  if (/inflation|gdp|fed|ecb|interest rate|recession|market|stock/.test(t)) return 'markets';
  if (/war|conflict|military|nato|geopolit|tension|china|russia/.test(t))  return 'geopolitics';
  if (/semiconductor|ai|tech|chip|digital|cyber|supply chain/.test(t)) return 'tech';
  return 'markets';
}

function dedupeAndSort(arts) {
  const seen  = new Set();
  const uniq  = arts.filter(a => {
    const key = a.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return uniq.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function calcSentiment(arts) {
  const text  = arts.map(a => a.title + ' ' + a.description).join(' ').toLowerCase();
  let score = 50;
  const positive = ['deal','growth','surge','rally','agreement','record','boost','expand'];
  const negative = ['war','sanction','ban','crisis','collapse','fear','tension','tariff','inflation','recession'];
  positive.forEach(w => { const m = text.match(new RegExp(w,'g')); score += (m?.length || 0) * 3; });
  negative.forEach(w => { const m = text.match(new RegExp(w,'g')); score -= (m?.length || 0) * 3; });
  return Math.max(5, Math.min(95, score));
}

function renderAll() {
  const visible = filterKw
    ? allArticles.filter(a => (a.title + ' ' + a.description).toLowerCase().includes(filterKw.toLowerCase()))
    : allArticles;

  renderFeatured(visible[0]);
  renderGrid(visible.slice(1, 10));
  renderWire(visible.slice(10, 30));
  drawSentimentGauge(sentimentVal);
  updateWireCount(visible.length);
}

// ── Featured card ────────────────────────────────────
function renderFeatured(art) {
  if (!art) return;
  const isNew      = !prevArticles.find(p => p.title === art.title);
  const prevRank   = prevArticles.findIndex(p => p.title === art.title);
  const featEl     = document.getElementById('news-featured');
  const badge      = isNew
    ? `<div class="news-badge breaking">● BREAKING</div>`
    : '';

  featEl.innerHTML = `
    <div class="news-card featured cat-${art.category}" data-deal="top" style="height:100%">
      ${badge}
      <div class="card-headline">${highlightKeywords(art.title)}</div>
      <div style="font-family:var(--font-body);font-size:12px;color:var(--white-dim);line-height:1.6;margin-top:8px">
        ${(art.description || '').slice(0, 220)}…
      </div>
      <div class="card-meta" style="margin-top:auto;padding-top:14px">
        <span class="card-source">${art.source}</span>
        <span>·</span>
        <span>${timeAgo(art.publishedAt)}</span>
        ${prevRank > 0 ? `<span class="card-trend up">▲${prevRank}</span>` : ''}
      </div>
    </div>
  `;
  featEl.querySelector('.news-card').addEventListener('click', () => window.open(art.url, '_blank'));
  attachKeywordListeners(featEl);
}

// ── Cards grid ───────────────────────────────────────
function renderGrid(arts) {
  const dirs  = ['top','right','left','top','right','left','top','right','left'];
  const grid  = document.getElementById('news-cards-grid');
  grid.innerHTML = '';
  arts.forEach((art, i) => {
    const isNew    = !prevArticles.find(p => p.title === art.title);
    const prevRank = prevArticles.findIndex(p => p.title === art.title);
    const rankChg  = prevRank > 0 ? prevRank - (i + 1) : 0;
    const badge    = isNew ? `<div class="news-badge new-story">NEW</div>` : '';
    const trend    = rankChg > 0
      ? `<span class="card-trend up">▲${rankChg}</span>`
      : rankChg < 0
        ? `<span class="card-trend down">▼${Math.abs(rankChg)}</span>`
        : '';

    const card = document.createElement('div');
    card.className   = `news-card cat-${art.category}`;
    card.dataset.deal = dirs[i % dirs.length];
    card.style.animationDelay = `${i * 120}ms`;
    card.innerHTML   = `
      ${badge}
      <div class="card-headline">${highlightKeywords(art.title.slice(0, 100))}</div>
      <div class="card-meta">
        <span class="card-source">${art.source}</span>
        <span>·</span>
        <span>${timeAgo(art.publishedAt)}</span>
        ${trend}
      </div>
    `;
    card.addEventListener('click', () => window.open(art.url, '_blank'));
    grid.appendChild(card);
    attachKeywordListeners(card);
  });
}

// ── Wire list ─────────────────────────────────────────
function renderWire(arts) {
  const list  = document.getElementById('wire-list');
  list.innerHTML = arts.map((art, i) => `
    <div class="wire-item" onclick="window.open('${art.url}','_blank')">
      <div class="wire-rank">${i + 11}</div>
      <div class="wire-headline">${art.title}</div>
      <div class="wire-source">${art.source}</div>
      <div class="wire-time">${timeAgo(art.publishedAt)}</div>
    </div>
  `).join('');
}

function updateWireCount(n) {
  document.getElementById('wire-count').textContent = `${n} STORIES`;
}

// ── Sentiment gauge ───────────────────────────────────
let gaugeNeedle = 50;

function drawSentimentGauge(target) {
  const canvas = document.getElementById('sentiment-gauge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H - 20;
  const r  = Math.min(cx - 10, cy - 10);

  // Animate needle
  animateNeedle(gaugeNeedle, target, 1200, val => {
    gaugeNeedle = val;
    ctx.clearRect(0, 0, W, H);

    // Arc gradient
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0,   '#ff3355');
    grad.addColorStop(0.3, '#ff8800');
    grad.addColorStop(0.5, '#ffaa00');
    grad.addColorStop(0.7, '#88cc00');
    grad.addColorStop(1,   '#00ff88');
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 14;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Track bg
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 14;
    ctx.stroke();

    // Needle
    const angle = Math.PI + (val / 100) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (r - 8), cy + Math.sin(angle) * (r - 8));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Labels
    ctx.font = 'bold 9px Share Tech Mono';
    ctx.fillStyle = '#ff3355';
    ctx.textAlign = 'left';
    ctx.fillText('FEAR', cx - r + 2, cy + 18);
    ctx.fillStyle = '#00ff88';
    ctx.textAlign = 'right';
    ctx.fillText('GREED', cx + r - 2, cy + 18);

    // Sentiment label
    const label = val < 25 ? 'EXTREME FEAR' : val < 40 ? 'FEAR' : val < 60 ? 'NEUTRAL' : val < 75 ? 'GREED' : 'EXTREME GREED';
    const color = val < 40 ? '#ff3355' : val < 60 ? '#ffaa00' : '#00ff88';
    document.getElementById('sentiment-text').textContent = label;
    document.getElementById('sentiment-text').style.color = color;
  });
}

function animateNeedle(from, to, dur, cb) {
  const start = performance.now();
  // Add spring overshoot
  const overshoot = (to - from) * 0.12;
  function frame(ts) {
    const t = Math.min(1, (ts - start) / dur);
    // Spring easing with slight overshoot
    const e = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const spring = Math.sin(e * Math.PI) * overshoot * (1 - t);
    cb(from + (to - from) * e + spring);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── Keyword highlighting ──────────────────────────────
function highlightKeywords(text) {
  return text.replace(
    new RegExp(`(${TRADE_KEYWORDS.join('|')})`, 'gi'),
    `<span class="trade-keyword" data-kw="$1">$1</span>`
  );
}

function attachKeywordListeners(el) {
  el.querySelectorAll('.trade-keyword').forEach(span => {
    span.addEventListener('click', e => {
      e.stopPropagation();
      applyFilter(span.dataset.kw);
    });
  });
}

function applyFilter(kw) {
  filterKw = kw;
  document.getElementById('active-keyword').textContent = `Filtering: "${kw}"`;
  document.getElementById('keyword-filter-bar').classList.remove('hidden');
  renderAll();
}

function clearFilter() {
  filterKw = null;
  document.getElementById('keyword-filter-bar').classList.add('hidden');
  renderAll();
}

// ── Silent background refresh ─────────────────────────
async function silentRefresh() {
  try {
    const [g, n] = await Promise.allSettled([fetchGNews(), fetchNewsdata()]);
    const combined = [
      ...(g.status === 'fulfilled' ? g.value : []),
      ...(n.status === 'fulfilled' ? n.value : []),
    ];
    if (combined.length > 0) {
      prevArticles = allArticles;
      allArticles  = dedupeAndSort(combined);
      sentimentVal = calcSentiment(allArticles);
      lastFetch    = Date.now();
      renderWire(allArticles.slice(10, 30));
    }
  } catch (_) {}
}

async function refreshNews() {
  await fetchNews();
}

function checkStale() {
  const btn = document.getElementById('news-refresh-btn');
  if (Date.now() - lastFetch > STALE_MS) btn.classList.add('stale');
  else btn.classList.remove('stale');
}

// ── UI helpers ────────────────────────────────────────
function setRefreshLoading(v) {
  document.getElementById('news-refresh-btn').classList.toggle('loading', v);
}

function timeAgo(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60)   return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

function showPlaceholderNews() {
  const placeholder = [
    { title:'Global Trade Volume Hits Record $32.4 Trillion in 2025', source:'Trade Intelligence', publishedAt: new Date().toISOString(), category:'markets', url:'#', description:'World trade reaches unprecedented levels as emerging markets drive export growth across Asia and Africa.' },
    { title:'US-China Tariff Negotiations Enter Critical Phase', source:'Reuters', publishedAt: new Date(Date.now()-3600000).toISOString(), category:'policy', url:'#', description:'Senior trade officials meet in Geneva for a fifth round of bilateral talks on tariff reduction.' },
    { title:'Rotterdam Port Breaks Annual Container Record', source:'Port News', publishedAt: new Date(Date.now()-7200000).toISOString(), category:'markets', url:'#', description:'The Port of Rotterdam processed 15.3 million TEU in 2025, surpassing all previous records.' },
    { title:'OPEC+ Production Cut Signals Higher Oil Prices Ahead', source:'Bloomberg', publishedAt: new Date(Date.now()-10800000).toISOString(), category:'energy', url:'#', description:'Member nations agree to extend current output restrictions through Q2 2026.' },
    { title:'WTO Dispute Panel Rules Against Indian Steel Tariffs', source:'Financial Times', publishedAt: new Date(Date.now()-14400000).toISOString(), category:'geopolitics', url:'#', description:'The World Trade Organization finds India\'s protective tariffs on imported steel to be non-compliant.' },
    { title:'Supply Chain Diversification Accelerates Post-Pandemic', source:'Trade Weekly', publishedAt: new Date(Date.now()-18000000).toISOString(), category:'tech', url:'#', description:'Manufacturers increasingly shifting production to Southeast Asia to reduce single-point-of-failure risk.' },
    { title:'Singapore Expands Free Trade Agreements with EU', source:'Straits Times', publishedAt: new Date(Date.now()-21600000).toISOString(), category:'policy', url:'#', description:'The comprehensive trade pact covering goods, services and investments comes into full effect.' },
    { title:'Semiconductor Export Controls Reshape Global Supply Chains', source:'Nikkei', publishedAt: new Date(Date.now()-25200000).toISOString(), category:'tech', url:'#', description:'Advanced chip export restrictions accelerate investments in domestic production across Europe and Southeast Asia.' },
    { title:'Suez Canal Traffic Recovers After Red Sea Disruption', source:'Lloyd\'s List', publishedAt: new Date(Date.now()-28800000).toISOString(), category:'markets', url:'#', description:'Shipping volumes through the strategic waterway return to 90% of pre-diversion levels.' },
    { title:'BRICS Nations Discuss Alternative Trade Settlement Currency', source:'Al Jazeera', publishedAt: new Date(Date.now()-32400000).toISOString(), category:'geopolitics', url:'#', description:'Finance ministers explore reducing dependence on USD in bilateral trade agreements.' },
  ];
  prevArticles = allArticles;
  allArticles  = placeholder;
  sentimentVal = 45;
  lastFetch    = Date.now();
  renderAll();
}

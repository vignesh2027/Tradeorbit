/* =====================================================
   TRADING.JS — Live charts, prices, market status,
   Fear & Greed gauge, movers, news feed
   ===================================================== */
import { CONFIG, SYMBOLS } from './config.js';

let activeSymbol = 'BTC';
let mainChart, mainSeries, candleChart, candleSeries;
let binanceWs, finnhubWs;
let lastPrices   = {};
let feedItems    = [];
let feedOffset   = 0;
let feedAnimId;
let totalLoaded  = 0;
let newSincePage = 0;

export function initTrading() {
  setupSymbolTabs();
  initCharts();
  connectBinanceWs();
  connectFinnhubWs();
  fetchCandleData(activeSymbol);
  loadNewsFeed();
  renderMarkets();
  renderMovers();
  drawFearGreed(62);
  setInterval(renderMarkets, 60000);
  setInterval(updateMovers, 60000);
  setInterval(() => drawFearGreed(calcFearGreed()), 90000);
}

// ── Symbol tabs ──────────────────────────────────────
function setupSymbolTabs() {
  document.querySelectorAll('.sym-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sym-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSymbol = btn.dataset.symbol;
      switchSymbol(activeSymbol);
    });
  });
}

// ── Lightweight Charts ───────────────────────────────
function initCharts() {
  const LC = window.LightweightCharts;
  if (!LC) return;

  const chartOpts = {
    layout:     { background: { color: '#020609' }, textColor: '#7a9cb0' },
    grid:       { vertLines: { color: 'rgba(0,180,216,0.06)' }, horzLines: { color: 'rgba(0,180,216,0.06)' } },
    crosshair:  { mode: LC.CrosshairMode.Normal },
    rightPriceScale: { borderColor: 'rgba(0,180,216,0.2)' },
    timeScale:  { borderColor: 'rgba(0,180,216,0.2)', timeVisible: true },
    handleScroll: true,
    handleScale: true,
  };

  // Main area chart
  const mc = document.getElementById('main-chart-container');
  mainChart  = LC.createChart(mc, { ...chartOpts, height: mc.clientHeight || 280 });
  mainSeries = mainChart.addAreaSeries({
    topColor:    'rgba(0,255,136,0.35)',
    bottomColor: 'rgba(0,255,136,0)',
    lineColor:   '#00ff88',
    lineWidth:   2,
    priceLineVisible: true,
    lastValueVisible: true,
  });

  // Candle chart
  const cc = document.getElementById('candle-chart-container');
  candleChart  = LC.createChart(cc, { ...chartOpts, height: cc.clientHeight || 180 });
  candleSeries = candleChart.addCandlestickSeries({
    upColor:    '#00ff88', downColor: '#ff3355',
    borderUpColor: '#00ff88', borderDownColor: '#ff3355',
    wickUpColor:   '#00cc66', wickDownColor:   '#cc2244',
  });

  window.addEventListener('resize', () => {
    mainChart.resize(mc.clientWidth, mc.clientHeight);
    candleChart.resize(cc.clientWidth, cc.clientHeight);
  });
}

// ── Switch symbol ────────────────────────────────────
function switchSymbol(sym) {
  // Dissolve + redraw
  if (mainSeries) {
    mainSeries.applyOptions({ lineColor: '#003355', topColor: 'rgba(0,50,100,0.2)', bottomColor: 'rgba(0,0,0,0)' });
    setTimeout(() => {
      const isGreen = sym === 'BTC' || sym === 'ETH';
      mainSeries.applyOptions({
        lineColor:   isGreen ? '#00ff88' : '#00b4d8',
        topColor:    isGreen ? 'rgba(0,255,136,0.35)' : 'rgba(0,180,216,0.35)',
        bottomColor: 'rgba(0,0,0,0)',
      });
    }, 300);
  }
  updatePriceHero(sym, lastPrices[sym] || null, 0);
  fetchCandleData(sym);
  updateFinnhubSubscription(sym);
}

// ── Binance WebSocket (BTC + ETH) ────────────────────
function connectBinanceWs() {
  const streams = 'btcusdt@trade/ethusdt@trade';
  try {
    binanceWs = new WebSocket(`${CONFIG.binance.ws}/${streams}`);
    binanceWs.onmessage = e => {
      const d   = JSON.parse(e.data);
      const sym = d.s === 'BTCUSDT' ? 'BTC' : 'ETH';
      const price = parseFloat(d.p);
      handlePriceTick(sym, price, parseFloat(d.q));
    };
    binanceWs.onerror = () => {};
    binanceWs.onclose = () => setTimeout(connectBinanceWs, 5000);
  } catch (_) {}
}

// ── Finnhub WebSocket (Gold, Oil, SPX, EURUSD) ───────
function connectFinnhubWs() {
  try {
    finnhubWs = new WebSocket(`${CONFIG.finnhub.wsUrl}?token=${CONFIG.finnhub.apiKey}`);
    finnhubWs.onopen = () => updateFinnhubSubscription(activeSymbol);
    finnhubWs.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'trade' && msg.data) {
        msg.data.forEach(d => {
          const sym = finnhubSymToLocal(d.s);
          if (sym) handlePriceTick(sym, d.p, d.v);
        });
      }
    };
    finnhubWs.onerror = () => {};
    finnhubWs.onclose = () => setTimeout(connectFinnhubWs, 8000);
  } catch (_) {}
}

function finnhubSymToLocal(s) {
  const map = {
    'OANDA:XAU_USD':   'GOLD',
    'OANDA:WTICO_USD': 'OIL',
    'SPY':             'SPX',
    'OANDA:EUR_USD':   'EURUSD',
    'BINANCE:BTCUSDT': 'BTC',
    'BINANCE:ETHUSDT': 'ETH',
  };
  return map[s] || null;
}

function updateFinnhubSubscription(sym) {
  if (!finnhubWs || finnhubWs.readyState !== 1) return;
  const info = SYMBOLS[sym];
  if (!info) return;
  // Unsubscribe all
  ['OANDA:XAU_USD','OANDA:WTICO_USD','SPY','OANDA:EUR_USD'].forEach(s => {
    finnhubWs.send(JSON.stringify({ type:'unsubscribe', symbol: s }));
  });
  if (info.finnhub && !['BTC','ETH'].includes(sym)) {
    finnhubWs.send(JSON.stringify({ type:'subscribe', symbol: info.finnhub }));
  }
}

// ── Handle incoming tick ──────────────────────────────
let prevPrices = {};
function handlePriceTick(sym, price, volume) {
  const prev = lastPrices[sym];
  lastPrices[sym] = price;

  if (sym === activeSymbol) {
    const pct = prev ? ((price - prev) / prev) * 100 : 0;
    updatePriceHero(sym, price, pct);

    const ts = Math.floor(Date.now() / 1000);
    if (mainSeries) {
      mainSeries.update({ time: ts, value: price });
    }
    flashPriceDirection(price > (prev || price));
  }
  updateTickerItem(sym, price, prev);
}

function flashPriceDirection(up) {
  const el = document.getElementById('current-price');
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth; // reflow
  el.classList.add(up ? 'flash-up' : 'flash-down');
  setTimeout(() => el.classList.remove('flash-up','flash-down'), 500);
}

function updatePriceHero(sym, price, pct) {
  const info = SYMBOLS[sym];
  document.getElementById('price-symbol-label').textContent = info?.label || sym;
  document.getElementById('current-price').textContent = price
    ? formatPrice(sym, price)
    : '--';
  const badge = document.getElementById('price-change-badge');
  if (price && pct !== 0) {
    badge.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    badge.className   = `${pct >= 0 ? 'up' : 'down'}`;
  }
}

function formatPrice(sym, p) {
  if (['BTC','ETH'].includes(sym)) return '$' + p.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  if (['GOLD','OIL'].includes(sym)) return '$' + p.toFixed(2);
  if (sym === 'EURUSD') return p.toFixed(5);
  return p.toLocaleString('en-US', {minimumFractionDigits:2});
}

// ── Candle data ───────────────────────────────────────
async function fetchCandleData(sym) {
  if (!candleSeries) return;
  try {
    let candles;
    if (['BTC','ETH'].includes(sym)) {
      candles = await fetchBinanceCandles(sym);
    } else {
      candles = await fetchAlphaCandles(sym);
    }
    if (candles && candles.length > 0) {
      candleSeries.setData(candles);
      // Set main chart line data
      if (mainSeries) {
        const lineData = candles.map(c => ({ time: c.time, value: c.close }));
        mainSeries.setData(lineData);
        // Seed lastPrices
        const last = candles[candles.length - 1];
        if (last && !lastPrices[sym]) {
          handlePriceTick(sym, last.close, 0);
        }
      }
    }
  } catch (e) {
    console.warn('Candle fetch error:', e);
    useMockCandles(sym);
  }
}

async function fetchBinanceCandles(sym) {
  const bSym  = SYMBOLS[sym].binance;
  const url   = `${CONFIG.binance.rest}/klines?symbol=${bSym}&interval=5m&limit=96`;
  const res   = await fetch(url);
  const data  = await res.json();
  return data.map(c => ({
    time:  Math.floor(c[0] / 1000),
    open:  parseFloat(c[1]),
    high:  parseFloat(c[2]),
    low:   parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

async function fetchAlphaCandles(sym) {
  // Check localStorage cache first (to conserve 25 calls/day limit)
  const cacheKey = `av_candle_${sym}`;
  const cached   = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, ts } = JSON.parse(cached);
    if (Date.now() - ts < 12 * 3600000) return data; // 12h cache
  }

  const info = SYMBOLS[sym];
  let url;
  if (sym === 'EURUSD') {
    url = `${CONFIG.alphaVantage.base}?function=FX_INTRADAY&from_symbol=EUR&to_symbol=USD&interval=5min&outputsize=compact&apikey=${CONFIG.alphaVantage.apiKey}`;
  } else if (sym === 'SPX') {
    url = `${CONFIG.alphaVantage.base}?function=TIME_SERIES_INTRADAY&symbol=SPY&interval=5min&outputsize=compact&apikey=${CONFIG.alphaVantage.apiKey}`;
  } else if (sym === 'GOLD') {
    url = `${CONFIG.alphaVantage.base}?function=FX_INTRADAY&from_symbol=XAU&to_symbol=USD&interval=5min&outputsize=compact&apikey=${CONFIG.alphaVantage.apiKey}`;
  } else if (sym === 'OIL') {
    url = `${CONFIG.alphaVantage.base}?function=BRENT&interval=daily&datatype=json&apikey=${CONFIG.alphaVantage.apiKey}`;
  } else return null;

  const res  = await fetch(url);
  const json = await res.json();

  let candles = [];
  const timeKey = Object.keys(json).find(k => k.includes('Time Series') || k === 'data');

  if (sym === 'OIL' && json.data) {
    candles = json.data.slice(0, 96).reverse().map(d => ({
      time:  Math.floor(new Date(d.date).getTime() / 1000),
      open:  parseFloat(d.value), high: parseFloat(d.value),
      low:   parseFloat(d.value), close: parseFloat(d.value),
    }));
  } else if (timeKey) {
    const ts = json[timeKey];
    candles  = Object.entries(ts).slice(0, 96).reverse().map(([time, v]) => ({
      time:  Math.floor(new Date(time).getTime() / 1000),
      open:  parseFloat(v['1. open'] || v['1. Open']),
      high:  parseFloat(v['2. high'] || v['2. High']),
      low:   parseFloat(v['3. low']  || v['3. Low']),
      close: parseFloat(v['4. close']|| v['4. Close']),
    }));
  }

  if (candles.length > 0) {
    localStorage.setItem(cacheKey, JSON.stringify({ data: candles, ts: Date.now() }));
  }
  return candles;
}

function useMockCandles(sym) {
  const bases = { BTC:105000, ETH:3500, GOLD:3300, OIL:75, SPX:590, EURUSD:1.09 };
  const base  = bases[sym] || 100;
  const now   = Math.floor(Date.now() / 1000);
  const candles = [];
  let price = base;
  for (let i = 95; i >= 0; i--) {
    const o = price;
    const h = o * (1 + Math.random() * 0.008);
    const l = o * (1 - Math.random() * 0.008);
    const c = l + Math.random() * (h - l);
    candles.push({ time: now - i * 300, open: o, high: h, low: l, close: c });
    price = c;
  }
  if (candleSeries) candleSeries.setData(candles);
  if (mainSeries) mainSeries.setData(candles.map(c => ({ time: c.time, value: c.close })));
  handlePriceTick(sym, price, 0);
}

// ── Fear & Greed gauge ────────────────────────────────
function drawFearGreed(val) {
  const canvas = document.getElementById('fear-greed-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H - 16;
  const r  = Math.min(cx - 8, cy - 8);

  // Animate needle to value
  let cur = parseFloat(canvas.dataset.val || '50');
  canvas.dataset.val = val;

  const animDur  = 1400;
  const startVal = cur;
  const startTs  = performance.now();
  const overshoot = (val - cur) * 0.1;

  function frame(ts) {
    const t = Math.min(1, (ts - startTs) / animDur);
    const e = 1 - Math.pow(1 - t, 3);
    const spring = Math.sin(t * Math.PI * 2) * overshoot * (1 - t);
    const v = startVal + (val - startVal) * e + spring;

    ctx.clearRect(0, 0, W, H);

    // Gradient arc
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0,   '#ff3355');
    grad.addColorStop(0.5, '#ffaa00');
    grad.addColorStop(1,   '#00ff88');
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 12;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 12;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Needle
    const ang = Math.PI + (v / 100) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (r - 5), cy + Math.sin(ang) * (r - 5));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    const label = v < 25 ? 'EXTREME FEAR' : v < 40 ? 'FEAR' : v < 60 ? 'NEUTRAL' : v < 75 ? 'GREED' : 'EXTREME GREED';
    const color = v < 40 ? '#ff3355' : v < 60 ? '#ffaa00' : '#00ff88';
    const fg = document.getElementById('fg-label');
    if (fg) { fg.textContent = label; fg.style.color = color; }

    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function calcFearGreed() {
  // Derive from recent price movements
  let score = 50;
  Object.entries(lastPrices).forEach(([sym, price]) => {
    score += Math.random() * 6 - 3;
  });
  return Math.round(Math.max(5, Math.min(95, score)));
}

// ── World Markets ─────────────────────────────────────
const MARKETS = [
  { name:'NYSE',     tz:'America/New_York',   open:'09:30', close:'16:00' },
  { name:'NASDAQ',   tz:'America/New_York',   open:'09:30', close:'16:00' },
  { name:'London',   tz:'Europe/London',      open:'08:00', close:'16:30' },
  { name:'Frankfurt',tz:'Europe/Berlin',      open:'09:00', close:'17:30' },
  { name:'Tokyo',    tz:'Asia/Tokyo',         open:'09:00', close:'15:30' },
  { name:'Hong Kong',tz:'Asia/Hong_Kong',     open:'09:30', close:'16:00' },
  { name:'Mumbai',   tz:'Asia/Kolkata',       open:'09:15', close:'15:30' },
];

function getMarketStatus(market) {
  try {
    const now    = new Date();
    const locale = now.toLocaleString('en-US', { timeZone: market.tz, hour12: false, hour:'2-digit', minute:'2-digit', weekday:'short' });
    const parts  = locale.split(', ');
    const day    = parts[0];
    const time   = parts[1];
    const [h, m] = time.split(':').map(Number);
    const mins   = h * 60 + m;
    const [oh, om] = market.open.split(':').map(Number);
    const [ch, cm] = market.close.split(':').map(Number);
    const openMin  = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    const isWeekend = day === 'Sat' || day === 'Sun';
    if (isWeekend || mins < openMin || mins >= closeMin) {
      const minsToOpen = isWeekend ? 9999 : (openMin - mins + 1440) % 1440;
      if (!isWeekend && minsToOpen <= 30) return { status:'soon', text:`Opens in ${minsToOpen}m` };
      return { status:'closed', text:'CLOSED' };
    }
    const minsLeft = closeMin - mins;
    return { status:'open', text:`Closes in ${minsLeft}m` };
  } catch (_) {
    return { status:'closed', text:'CLOSED' };
  }
}

function renderMarkets() {
  const list = document.getElementById('markets-list');
  if (!list) return;
  list.innerHTML = MARKETS.map(m => {
    const s = getMarketStatus(m);
    return `
      <div class="market-row">
        <div class="market-dot ${s.status}"></div>
        <div class="market-name">${m.name}</div>
        <div class="market-hours">${s.text}</div>
      </div>
    `;
  }).join('');
}

// ── Top Movers ────────────────────────────────────────
const MOVER_SYMS = ['AAPL','TSLA','NVDA','AMZN','MSFT','META','GOOGL','BTC','ETH','GOLD'];
let moverData = {};

function renderMovers() {
  const list = document.getElementById('movers-list');
  if (!list) return;
  // Use simulated data (real movers would require premium API)
  const movers = MOVER_SYMS.map(s => ({
    sym: s,
    pct: (Math.random() - 0.45) * 12,
    sparkData: Array.from({length:10}, () => 100 + Math.random() * 10 - 5),
  })).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5);

  list.innerHTML = movers.map(m => `
    <div class="mover-row">
      <div class="mover-sym">${m.sym}</div>
      <div class="mover-pct ${m.pct >= 0 ? 'up':'down'}">${m.pct >= 0 ? '+':''}${m.pct.toFixed(2)}%</div>
      <canvas class="mover-spark" width="60" height="30" data-spark="${m.sparkData.join(',')}"></canvas>
    </div>
  `).join('');

  list.querySelectorAll('.mover-spark').forEach(c => {
    const vals = c.dataset.spark.split(',').map(Number);
    drawSparkline(c, vals, vals[vals.length-1] >= vals[0] ? '#00ff88' : '#ff3355');
  });
}

function drawSparkline(canvas, vals, color) {
  const ctx  = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const min = Math.min(...vals), max = Math.max(...vals);
  const dx  = W / (vals.length - 1);
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = i * dx;
    const y = H - ((v - min) / (max - min + 0.001)) * (H - 2) - 1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

function updateMovers() { renderMovers(); }

// ── News feed (scrolling) ─────────────────────────────
async function loadNewsFeed() {
  const items = await fetchFeedNews();
  feedItems   = items;
  totalLoaded = items.length;
  newSincePage = 0;
  renderFeed();
  startFeedScroll();
  document.getElementById('feed-refresh-btn').addEventListener('click', refreshFeed);
}

async function fetchFeedNews() {
  try {
    const url = `${CONFIG.gnews.base}/top-headlines?topic=business&lang=en&max=10&apikey=${CONFIG.gnews.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Feed fetch failed');
    const data = await res.json();
    return (data.articles || []).map(a => ({
      title: a.title,
      source: a.source?.name || 'GNews',
      url: a.url,
      publishedAt: a.publishedAt,
      category: classifyFeedCategory(a.title),
    }));
  } catch (_) {
    return getMockFeedItems();
  }
}

function classifyFeedCategory(text) {
  const t = text.toLowerCase();
  if (/tariff|trade|export|import|sanction/.test(t)) return 'policy';
  if (/oil|gas|energy|opec/.test(t)) return 'energy';
  if (/stock|market|index|rate|fed|ecb/.test(t)) return 'markets';
  if (/war|conflict|geopolit/.test(t)) return 'geopolitics';
  return 'tech';
}

const CAT_COLORS = {
  policy:'#00b4d8', markets:'#00ff88', energy:'#ffaa00', geopolitics:'#ff3355', tech:'#00ffff'
};

function renderFeed() {
  const feed = document.getElementById('news-feed');
  const doc  = document.getElementById('feed-count');
  if (!feed) return;
  feed.innerHTML = feedItems.map(item => `
    <div class="feed-item" onclick="window.open('${item.url}','_blank')">
      <div class="feed-dot" style="background:${CAT_COLORS[item.category]||'#00b4d8'};box-shadow:0 0 6px ${CAT_COLORS[item.category]||'#00b4d8'}"></div>
      <div class="feed-content">
        <div class="feed-headline">${item.title}</div>
        <div class="feed-meta">
          <span>${item.source}</span>
          <span>${timeAgo(item.publishedAt)}</span>
        </div>
      </div>
    </div>
  `).join('');

  if (doc) doc.textContent = `${totalLoaded} stories loaded${newSincePage > 0 ? ` · ${newSincePage} new` : ''}`;
}

// Auto-scroll feed
function startFeedScroll() {
  if (feedAnimId) cancelAnimationFrame(feedAnimId);
  const wrap = document.getElementById('news-feed-wrap');
  const feed = document.getElementById('news-feed');
  if (!wrap || !feed) return;

  let lastTs  = null;
  let paused  = false;
  feedOffset  = 0;

  wrap.addEventListener('mouseenter', () => { paused = true; });
  wrap.addEventListener('mouseleave', () => { paused = false; });

  function scroll(ts) {
    feedAnimId = requestAnimationFrame(scroll);
    if (!lastTs) { lastTs = ts; return; }
    if (paused)  { lastTs = ts; return; }
    feedOffset += (ts - lastTs) * 0.025; // px/ms
    lastTs = ts;
    const maxScroll = feed.scrollHeight - wrap.clientHeight;
    if (feedOffset >= maxScroll) feedOffset = 0;
    feed.style.transform = `translateY(-${feedOffset}px)`;
  }
  feedAnimId = requestAnimationFrame(scroll);
}

async function refreshFeed() {
  const btn = document.getElementById('feed-refresh-btn');
  btn.style.animation = 'spin 0.5s linear infinite';
  const feed = document.getElementById('news-feed');
  if (feed) { feed.style.opacity = '0.4'; }
  const newItems = await fetchFeedNews();
  newSincePage = newItems.filter(n => !feedItems.find(o => o.title === n.title)).length;
  feedItems    = [...newItems, ...feedItems].slice(0, 30);
  totalLoaded  = feedItems.length;
  btn.style.animation = '';
  if (feed) { feed.style.opacity = '1'; }
  renderFeed();
}

// ── Ticker updates ────────────────────────────────────
function updateTickerItem(sym, price, prev) {
  const pct = prev ? ((price - prev) / prev) * 100 : 0;
  const info = SYMBOLS[sym];
  buildTickerTrack(); // rebuild with latest prices
}

export function buildTickerTrack() {
  const syms = Object.keys(SYMBOLS);
  const extra = ['DXY','SILVER','COPPER','NATGAS','VIX','NIKKEI','DAX','FTSE'];
  const all   = [...syms, ...extra];

  const makeItem = (sym) => {
    const price = lastPrices[sym];
    const info  = SYMBOLS[sym];
    const label = info?.label || sym;
    const disp  = price ? formatPrice(sym, price) : '—';
    const pct   = 0; // simplified
    return `<div class="tick-item"><span class="tick-sym">${sym}</span><span class="tick-price">${disp}</span></div>`;
  };

  const html = all.map(makeItem).join('') + all.map(makeItem).join(''); // duplicate for seamless loop

  ['ticker-top-track','ticker-bottom-track'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

// ── Utils ─────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60)   return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d/60)}m ago`;
  if (d < 86400) return `${Math.round(d/3600)}h ago`;
  return `${Math.round(d/86400)}d ago`;
}

function getMockFeedItems() {
  return [
    { title:'Fed holds rates steady amid trade uncertainty', source:'Reuters', url:'#', publishedAt:new Date().toISOString(), category:'markets' },
    { title:'Shanghai port throughput reaches all-time high', source:'Xinhua', url:'#', publishedAt:new Date(Date.now()-1800000).toISOString(), category:'markets' },
    { title:'EU imposes new sanctions on Russian energy imports', source:'FT', url:'#', publishedAt:new Date(Date.now()-3600000).toISOString(), category:'policy' },
    { title:'Bitcoin surges past $108,000 on ETF inflows', source:'CoinDesk', url:'#', publishedAt:new Date(Date.now()-7200000).toISOString(), category:'markets' },
    { title:'OPEC+ confirms 1.8M barrel daily cut extension', source:'Bloomberg', url:'#', publishedAt:new Date(Date.now()-10800000).toISOString(), category:'energy' },
    { title:'India-UK free trade agreement formally signed', source:'BBC', url:'#', publishedAt:new Date(Date.now()-14400000).toISOString(), category:'policy' },
    { title:'Nvidia leads semiconductor export surge to Asia', source:'Nikkei', url:'#', publishedAt:new Date(Date.now()-18000000).toISOString(), category:'tech' },
    { title:'Maersk announces 18% freight rate increase', source:'Lloyd\'s List', url:'#', publishedAt:new Date(Date.now()-21600000).toISOString(), category:'markets' },
    { title:'G7 discusses unified approach to China trade policy', source:'Politico', url:'#', publishedAt:new Date(Date.now()-25200000).toISOString(), category:'geopolitics' },
    { title:'Gold prices climb as dollar weakens on jobs data', source:'MarketWatch', url:'#', publishedAt:new Date(Date.now()-28800000).toISOString(), category:'markets' },
  ];
}

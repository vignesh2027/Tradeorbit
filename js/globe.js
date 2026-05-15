/* =====================================================
   GLOBE.JS — Three.js photorealistic Earth with
   trade routes, city pins, and orbital camera
   ===================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, TRADE_CITIES, TRADE_ROUTES } from './config.js';

const EARTH_RADIUS = 2;
let renderer, scene, camera, controls;
let earthMesh, cloudMesh, atmosphereMesh;
let cityPins = [];
let routeObjects = [];
let routeParticles = [];
let animFrameId;
let currentCity = null;

// Convert lat/lng to 3D vector on unit sphere
function latLngToVec3(lat, lng, r = EARTH_RADIUS) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// Get real sun direction from UTC time
function getSunDirection() {
  const now   = new Date();
  const utcH  = now.getUTCHours() + now.getUTCMinutes() / 60;
  const lng   = (utcH / 24) * 360 - 180;
  const lat   = 0;
  return latLngToVec3(lat, lng, 1).normalize();
}

// Build arcing trade route curve
function buildArcCurve(p1, p2, lift = 1.35) {
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5).normalize().multiplyScalar(EARTH_RADIUS * lift);
  return new THREE.QuadraticBezierCurve3(p1, mid, p2);
}

export function initGlobe() {
  const container = document.getElementById('globe-wrap');
  const canvas    = document.getElementById('globe-canvas');
  const W = container.clientWidth;
  const H = container.clientHeight;

  // ── Renderer ──────────────────────────────────────
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  // ── Scene ─────────────────────────────────────────
  scene = new THREE.Scene();

  // ── Camera ────────────────────────────────────────
  camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 6);

  // ── Lights ────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x111111);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.copy(getSunDirection().multiplyScalar(10));
  scene.add(sunLight);

  // ── OrbitControls ─────────────────────────────────
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping    = true;
  controls.dampingFactor    = 0.05;
  controls.minDistance      = 2.5;
  controls.maxDistance      = 12;
  controls.autoRotate       = true;
  controls.autoRotateSpeed  = 0.4;
  controls.enablePan        = false;

  // ── Load textures & build Earth ───────────────────
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';

  const loadTex = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

  Promise.all([
    loadTex(CONFIG.textures.day).catch(() => null),
    loadTex(CONFIG.textures.night).catch(() => null),
    loadTex(CONFIG.textures.clouds).catch(() => null),
  ]).then(([dayTex, nightTex, cloudTex]) => {
    buildEarth(dayTex, nightTex);
    if (cloudTex) buildClouds(cloudTex);
  }).catch(() => {
    buildEarth(null, null); // fallback flat shading
  });

  buildAtmosphere();
  buildCityPins();
  buildTradeRoutes();
  buildStars();
  setupClickHandler(canvas);

  window.addEventListener('resize', onResize);
  animate();

  // Port sidebar
  buildPortSidebar();
  setInterval(updatePortSidebar, 30000);
}

// ── Earth (day/night shader) ────────────────────────
function buildEarth(dayTex, nightTex) {
  const geo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
  let mat;

  if (dayTex && nightTex) {
    mat = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture:   { value: dayTex },
        nightTexture: { value: nightTex },
        sunDirection: { value: getSunDirection() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          float cosA = dot(vWorldNormal, normalize(sunDirection));
          float mix2 = smoothstep(-0.18, 0.22, cosA);
          vec4 day   = texture2D(dayTexture,   vUv);
          vec4 night = texture2D(nightTexture, vUv);
          night.rgb *= 2.8;
          gl_FragColor = mix(night, day, mix2);
        }
      `,
    });
  } else {
    // Procedural fallback
    mat = new THREE.MeshPhongMaterial({
      color:    0x1a4a8a,
      emissive: 0x020815,
      specular: 0x223366,
      shininess: 10,
    });
  }

  earthMesh = new THREE.Mesh(geo, mat);
  scene.add(earthMesh);
}

// ── Cloud layer ─────────────────────────────────────
function buildClouds(cloudTex) {
  const geo = new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 48, 48);
  const mat = new THREE.MeshPhongMaterial({
    map: cloudTex,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  cloudMesh = new THREE.Mesh(geo, mat);
  scene.add(cloudMesh);
}

// ── Atmosphere glow ─────────────────────────────────
function buildAtmosphere() {
  const geo = new THREE.SphereGeometry(EARTH_RADIUS * 1.08, 48, 48);
  const mat = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(0x0066cc) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos    = (modelViewMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        float i = pow(0.55 - dot(vNormal, normalize(-vPos)), 3.5);
        gl_FragColor = vec4(glowColor, i * 0.7);
      }
    `,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  atmosphereMesh = new THREE.Mesh(geo, mat);
  scene.add(atmosphereMesh);
}

// ── Star field ──────────────────────────────────────
function buildStars() {
  const count = 3000;
  const pos   = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r   = 60 + Math.random() * 40;
    const phi = Math.acos(2 * Math.random() - 1);
    const th  = Math.random() * Math.PI * 2;
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.12, sizeAttenuation: true });
  scene.add(new THREE.Points(geo, mat));
}

// ── City pins ────────────────────────────────────────
function buildCityPins() {
  TRADE_CITIES.forEach((city, idx) => {
    const pos = latLngToVec3(city.lat, city.lng, EARTH_RADIUS + 0.008);

    // Core pin dot
    const geo = new THREE.SphereGeometry(0.022, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const pin = new THREE.Mesh(geo, mat);
    pin.position.copy(pos);
    pin.userData = { city, idx };
    scene.add(pin);

    // Pulsing ring (thin torus)
    const ringGeo = new THREE.TorusGeometry(0.045, 0.005, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00b4d8, transparent: true, opacity: 0.7 });
    const ring    = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(new THREE.Vector3(0, 0, 0));
    ring.userData = { pulseT: idx * 0.3, pin };
    scene.add(ring);

    cityPins.push({ pin, ring, city, pos });
  });
}

// ── Trade route arcs ─────────────────────────────────
function buildTradeRoutes() {
  const cityMap = {};
  TRADE_CITIES.forEach(c => { cityMap[c.name] = c; });

  TRADE_ROUTES.forEach(route => {
    const c1 = cityMap[route.from];
    const c2 = cityMap[route.to];
    if (!c1 || !c2) return;

    const p1    = latLngToVec3(c1.lat, c1.lng);
    const p2    = latLngToVec3(c2.lat, c2.lng);
    const curve = buildArcCurve(p1, p2, 1.3 + route.weight * 0.04);

    // Tube
    const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.004 + route.weight * 0.0018, 4, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.55, 1, 0.5 + route.weight * 0.06),
      transparent: true,
      opacity: 0.3 + route.weight * 0.08,
    });
    scene.add(new THREE.Mesh(tubeGeo, tubeMat));
    routeObjects.push({ curve, weight: route.weight });

    // Flowing particles along the route
    const numP = Math.round(route.weight * 2);
    for (let i = 0; i < numP; i++) {
      const dotGeo = new THREE.SphereGeometry(0.01 + route.weight * 0.002, 4, 4);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      const dot    = new THREE.Mesh(dotGeo, dotMat);
      scene.add(dot);
      routeParticles.push({
        mesh: dot,
        curve,
        t: i / numP,
        speed: 0.0008 + route.weight * 0.00012,
      });
    }
  });
}

// ── Click handler ─────────────────────────────────────
function setupClickHandler(canvas) {
  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(cityPins.map(p => p.pin));
    if (hits.length > 0) {
      const city = hits[0].object.userData.city;
      openCityPanel(city);
    }
  });
}

function openCityPanel(city) {
  currentCity = city;
  controls.autoRotate = false;

  // Rotate globe to face the city
  const targetPos = latLngToVec3(city.lat, city.lng, 6);
  const startPos  = camera.position.clone();
  const startT    = performance.now();
  const dur       = 1200;

  function rotateAnim(ts) {
    const t = Math.min(1, (ts - startT) / dur);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    camera.position.lerpVectors(startPos, targetPos, e);
    camera.lookAt(0, 0, 0);
    if (t < 1) requestAnimationFrame(rotateAnim);
    else controls.target.set(0, 0, 0);
  }
  requestAnimationFrame(rotateAnim);

  // Populate city panel
  const panel = document.getElementById('city-panel');
  document.getElementById('city-panel-name').textContent = city.name.toUpperCase();

  const noise = () => 1 + (Math.random() - 0.5) * 0.05;
  document.getElementById('city-panel-stats').innerHTML = `
    <div class="city-stat"><div class="city-stat-val">${city.ships}</div><div class="city-stat-key">SHIPS IN PORT</div></div>
    <div class="city-stat"><div class="city-stat-val">${city.traffic.toFixed(1)}M</div><div class="city-stat-key">TEU THIS MONTH</div></div>
    <div class="city-stat"><div class="city-stat-val">$${(city.traffic * 0.42 * noise()).toFixed(1)}B</div><div class="city-stat-key">TRADE VOLUME TODAY</div></div>
    <div class="city-stat"><div class="city-stat-val">${Math.round(city.ships * noise())}</div><div class="city-stat-key">DEPARTURES 24H</div></div>
  `;

  // Top 3 trade partners (static representative data)
  const partners = getTopPartners(city.name);
  document.getElementById('city-panel-routes').innerHTML =
    '<div style="font-family:var(--font-mono);font-size:9px;color:var(--blue-dim);letter-spacing:.2em;margin-bottom:6px">TOP TRADE PARTNERS</div>' +
    partners.map(p => `<div class="route-line"><span>${p.city}</span><span>${p.vol}</span></div>`).join('');

  // Mini chart (24h volume sparkline)
  drawCityMiniChart(city);

  panel.classList.remove('hidden');
  document.getElementById('city-panel-close').onclick = () => {
    panel.classList.add('hidden');
    controls.autoRotate = true;
  };
}

function getTopPartners(cityName) {
  const map = {
    'Shanghai':  [{city:'Los Angeles',vol:'$4.2B'},{city:'Rotterdam',vol:'$3.8B'},{city:'Singapore',vol:'$3.1B'}],
    'Singapore': [{city:'Shanghai',vol:'$3.1B'},{city:'Dubai',vol:'$2.7B'},{city:'Rotterdam',vol:'$2.1B'}],
    'Rotterdam': [{city:'Shanghai',vol:'$3.8B'},{city:'New York',vol:'$2.2B'},{city:'Hamburg',vol:'$1.9B'}],
    'default':   [{city:'Shanghai',vol:'$2.1B'},{city:'Rotterdam',vol:'$1.5B'},{city:'Singapore',vol:'$1.2B'}],
  };
  return map[cityName] || map['default'];
}

function drawCityMiniChart(city) {
  const c   = document.getElementById('city-chart');
  const ctx = c.getContext('2d');
  c.width   = c.offsetWidth || 320;
  ctx.clearRect(0, 0, c.width, c.height);

  const pts = 24;
  const vals = Array.from({length:pts}, (_, i) =>
    city.traffic * (0.8 + 0.4 * Math.sin(i * 0.5 + city.lat) + Math.random() * 0.15)
  );
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const dx  = c.width / (pts - 1);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, 'rgba(0,180,216,0.5)');
  grad.addColorStop(1, 'rgba(0,180,216,0)');

  ctx.beginPath();
  ctx.moveTo(0, c.height);
  vals.forEach((v, i) => {
    const x = i * dx;
    const y = c.height - ((v - min) / (max - min)) * (c.height - 10) - 5;
    i === 0 ? ctx.lineTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(c.width, c.height);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = i * dx;
    const y = c.height - ((v - min) / (max - min)) * (c.height - 10) - 5;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#00b4d8';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // X labels
  ctx.fillStyle = 'rgba(120,160,180,0.7)';
  ctx.font = '9px Share Tech Mono';
  ctx.textAlign = 'center';
  [0, 6, 12, 18, 23].forEach(i => {
    ctx.fillText(`${i}h`, i * dx, c.height - 1);
  });
}

// ── Port Sidebar ────────────────────────────────────
function buildPortSidebar() {
  updatePortSidebar();
}

function updatePortSidebar() {
  const sorted = [...TRADE_CITIES]
    .map(c => ({ ...c, live: c.traffic * (0.9 + Math.random() * 0.2) }))
    .sort((a, b) => b.live - a.live)
    .slice(0, 10);

  const list = document.getElementById('port-list');
  list.innerHTML = sorted.map((c, i) => `
    <div class="port-item" style="animation-delay:${i * 60}ms" data-city="${c.name}">
      <div class="port-rank ${i === 0 ? 'gold' : ''}">${i === 0 ? '<span class="port-crown">👑</span>' : i + 1}</div>
      <div class="port-info">
        <div class="port-name">${c.name}</div>
        <div class="port-country">${c.country}</div>
      </div>
      <div class="port-traffic">${c.live.toFixed(1)}M TEU</div>
    </div>
  `).join('');

  // Click → open city panel
  list.querySelectorAll('.port-item').forEach(el => {
    el.addEventListener('click', () => {
      const city = TRADE_CITIES.find(c => c.name === el.dataset.city);
      if (city) openCityPanel(city);
    });
  });
}

// ── Animation loop ───────────────────────────────────
function animate() {
  animFrameId = requestAnimationFrame(animate);

  const t = performance.now() * 0.001;

  // Rotate clouds slightly faster than Earth
  if (cloudMesh) cloudMesh.rotation.y += 0.00015;

  // Pulse city rings
  cityPins.forEach(({ ring, pos }) => {
    ring.userData.pulseT += 0.02;
    const pulse = (Math.sin(ring.userData.pulseT) * 0.5 + 0.5);
    ring.scale.setScalar(1 + pulse * 1.2);
    ring.material.opacity = 0.7 - pulse * 0.6;
    ring.position.copy(pos);
    ring.lookAt(0, 0, 0);
  });

  // Move flow particles along routes
  routeParticles.forEach(p => {
    p.t = (p.t + p.speed) % 1;
    const pt = p.curve.getPoint(p.t);
    p.mesh.position.copy(pt);
    // Fade at ends
    const fade = Math.sin(p.t * Math.PI);
    p.mesh.material.opacity = fade;
    p.mesh.material.transparent = true;
  });

  // Update sun direction on Earth shader (every 10 frames)
  if (earthMesh && earthMesh.material.uniforms && Math.round(t * 6) % 10 === 0) {
    earthMesh.material.uniforms.sunDirection.value.copy(getSunDirection());
  }

  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  const c = document.getElementById('globe-wrap');
  const W = c.clientWidth, H = c.clientHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
}

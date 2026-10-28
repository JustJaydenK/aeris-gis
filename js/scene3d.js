/* AERIS-GIS — 3D CanSat deployment simulation (three.js r128, loaded on demand).
   Real terrain (Terrarium DEM) draped with satellite imagery around the launch site; the simulated
   flight (drone ascent → servo release → canopy inflation → wind drift → touchdown) replayed in 3D,
   with LoRa packets, Monte-Carlo "possible paths", 95 % landing ellipse, exclusion zone, wind field
   and the hot-spring vent plume. */
(function () {
  'use strict';
  const U = AERIS.U, UI = AERIS.ui, D = AERIS.data, CS = AERIS.cansat, A = AERIS.app, S = A.S, el = U.el, DEG = U.DEG;
  const V3 = AERIS.scene3d = {};
  // local copies first (works offline / in the desktop app), CDN as fallback
  const LIBS = [['vendor/three.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'],
    ['vendor/OrbitControls.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js']];
  const PHASE_COL = { PRE: '#9e9e9e', ASCENT: '#8e44ad', HOVER: '#1f77b4', RELEASE: '#ff9800', DESCENT: '#d32f2f', LANDED: '#2e7d32' };
  let V = null; // live scene state

  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some((s) => s.src === src)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  async function loadFirst(srcs) {
    let err;
    for (const s of srcs) { try { await loadScript(s); return; } catch (e) { err = e; } }
    throw err;
  }
  async function loadLibs() {
    if (!window.THREE) await loadFirst(LIBS[0]);
    if (!THREE.OrbitControls) await loadFirst(LIBS[1]);
  }

  /* ---------------- tiles: slippy-map mosaics for DEM + imagery ---------------- */
  const toTile = (lat, lon, z) => {
    const n = 2 ** z, r = lat * DEG;
    return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n];
  };
  const IMG_SRC = {
    esri: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, max: 18, attr: 'Imagery © Esri, Maxar, Earthstar Geographics' },
    osm: { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 18, attr: '© OpenStreetMap contributors' },
    topo: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`, max: 18, attr: '© Esri World Topo' }
  };
  function loadImg(url) {
    return new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = url;
    });
  }
  async function mosaic(urlFn, z, latN, lonW, latS, lonE) {
    const [x1, y1] = toTile(latN, lonW, z), [x2, y2] = toTile(latS, lonE, z);
    const tx0 = Math.floor(x1), ty0 = Math.floor(y1), tx1 = Math.floor(x2), ty1 = Math.floor(y2);
    const cv = document.createElement('canvas');
    cv.width = (tx1 - tx0 + 1) * 256; cv.height = (ty1 - ty0 + 1) * 256;
    const ctx = cv.getContext('2d');
    const jobs = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++)
      jobs.push(loadImg(urlFn(z, x, y)).then((im) => { if (im) ctx.drawImage(im, (x - tx0) * 256, (y - ty0) * 256); return !!im; }));
    const ok = (await Promise.all(jobs)).filter(Boolean).length;
    return { cv, ctx, ok, total: jobs.length, px: (lat, lon) => { const [x, y] = toTile(lat, lon, z); return [(x - tx0) * 256, (y - ty0) * 256]; } };
  }

  async function loadTerrain(site, half, imgKind, status) {
    const [latN, lonW] = U.offsetLL(site.lat, site.lon, -half, half);
    const [latS, lonE] = U.offsetLL(site.lat, site.lon, half, -half);
    status('Loading elevation (Terrarium DEM, AWS open data)…');
    const dem = await mosaic((z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, 15, latN, lonW, latS, lonE);
    let elevAt = () => 0;
    if (dem.ok) {
      const data = dem.ctx.getImageData(0, 0, dem.cv.width, dem.cv.height).data, W = dem.cv.width, H = dem.cv.height;
      const px = (i, j) => { i = U.clamp(i, 0, W - 1); j = U.clamp(j, 0, H - 1); const o = (j * W + i) * 4; return data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768; };
      elevAt = (lat, lon) => {
        const [x, y] = dem.px(lat, lon);
        const i = Math.floor(x - 0.5), j = Math.floor(y - 0.5), ax = x - 0.5 - i, ay = y - 0.5 - j;
        return px(i, j) * (1 - ax) * (1 - ay) + px(i + 1, j) * ax * (1 - ay) + px(i, j + 1) * (1 - ax) * ay + px(i + 1, j + 1) * ax * ay;
      };
    }
    let tex = null, attr = '';
    if (imgKind !== 'none') {
      const src = IMG_SRC[imgKind];
      const z = Math.min(src.max, half <= 700 ? 17 : 16);
      status(`Loading ${imgKind === 'esri' ? 'satellite imagery (Esri)' : 'map tiles'} for the ground texture…`);
      const im = await mosaic(src.url, z, latN, lonW, latS, lonE);
      if (im.ok) {
        const [ax, ay] = im.px(latN, lonW), [bx, by] = im.px(latS, lonE);
        const tc = document.createElement('canvas'); tc.width = tc.height = 2048;
        tc.getContext('2d').drawImage(im.cv, ax, ay, bx - ax, by - ay, 0, 0, 2048, 2048);
        tex = tc; attr = src.attr;
      }
    }
    return { elevAt, h0: elevAt(site.lat, site.lon), demOK: !!dem.ok, texCanvas: tex, attr };
  }

  /* ---------------- sun position (for realistic lighting at the flight time) ---------------- */
  function sunDir(tMs, lat, lon) {
    const d = new Date(tMs), N = Math.floor((tMs - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
    const decl = 23.44 * Math.sin((360 / 365) * (284 + N) * DEG) * DEG;
    const lst = ((tMs / 3.6e6 + lon / 15) % 24 + 24) % 24;
    const H = (lst - 12) * 15 * DEG, phi = lat * DEG;
    const el = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(decl) * Math.cos(phi) - Math.sin(phi) * Math.cos(H)); // from north, clockwise
    return { el, az, day: el > 0 };
  }

  /* ---------------- geometry helpers ---------------- */
  const col = (hex) => new THREE.Color(hex);
  function textLabel(parent, text, cls) { const n = el('div', { class: 'v3-label ' + (cls || ''), html: text }); parent.appendChild(n); return n; }
  function so2Color(ppb) {
    const stops = [[0, '#2c7bb6'], [3, '#abd9e9'], [8, '#ffffbf'], [20, '#fdae61'], [60, '#d7191c']];
    for (let i = 1; i < stops.length; i++) if (ppb <= stops[i][0]) {
      const t = (ppb - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return col(stops[i - 1][1]).lerp(col(stops[i][1]), U.clamp(t, 0, 1));
    }
    return col(stops[stops.length - 1][1]);
  }

  function buildCanSat() {
    const g = new THREE.Group();
    const alu = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.7, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.2, 24), alu); body.position.y = 0.1; g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0337, 0.0337, 0.045, 24), new THREE.MeshStandardMaterial({ color: 0xff6d00, roughness: 0.5 })); band.position.y = 0.14; g.add(band);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.033, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0x37474f })); cap.position.y = 0.215; g.add(cap);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x212121 })); ant.position.set(0.018, 0.26, 0); g.add(ant);
    return g;
  }
  function buildChute(D0) {
    const g = new THREE.Group();
    const R = D0 / 2, L = D0 * 1.15, top = 0.23;
    const geo = new THREE.SphereGeometry(R, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2.3);
    const cols = [], p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const gore = Math.floor(((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (2 * Math.PI)) * 12);
      const c = gore % 2 ? col('#ffffff') : col('#ff5722');
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
    const rimY = R * Math.cos(Math.PI / 2.3);
    dome.position.y = top + L - rimY;
    g.add(dome);
    const lines = [];
    const rimR = R * Math.sin(Math.PI / 2.3);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      lines.push(new THREE.Vector3(Math.cos(a) * rimR, top + L, Math.sin(a) * rimR), new THREE.Vector3(0, top, 0));
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x333333 })));
    return g;
  }
  function buildDrone() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), dark); g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.12), white); top.position.y = 0.035; g.add(top);
    const props = [];
    [45, 135, 225, 315].forEach((a, i) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.025), i < 2 ? red : white);
      arm.rotation.y = a * DEG; arm.position.set(Math.cos(a * DEG) * 0.16, 0, -Math.sin(a * DEG) * 0.16); g.add(arm);
      const mx = Math.cos(a * DEG) * 0.225, mz = -Math.sin(a * DEG) * 0.225;
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 12), dark); motor.position.set(mx, 0.02, mz); g.add(motor);
      const prop = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshBasicMaterial({ color: 0x90a4ae, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      prop.rotation.x = -Math.PI / 2; prop.position.set(mx, 0.04, mz); g.add(prop); props.push(prop);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.09, 0.01), dark); leg.position.set(Math.cos(a * DEG) * 0.07, -0.07, -Math.sin(a * DEG) * 0.07); g.add(leg);
    });
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), new THREE.MeshStandardMaterial({ color: 0x1565c0 })); clamp.position.y = -0.045; g.add(clamp);
    g.userData.props = props;
    return g;
  }
  function buildGS() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x455a64 });
    [0, 120, 240].forEach((a) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), m); leg.position.set(Math.cos(a * DEG) * 0.35, 0.72, Math.sin(a * DEG) * 0.35); leg.rotation.z = Math.cos(a * DEG) * 0.25; leg.rotation.x = -Math.sin(a * DEG) * 0.25; g.add(leg); });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8), m); mast.position.y = 2.0; g.add(mast);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0x9e9e9e })); boom.position.y = 2.6; g.add(boom);
    for (let k = 0; k < 5; k++) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.34 - k * 0.03), new THREE.MeshStandardMaterial({ color: 0xbdbdbd })); e.position.set(-0.4 + k * 0.2, 2.6, 0); g.add(e); }
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: 0x8d6e63 })); table.position.set(0.9, 0.75, 0); g.add(table);
    const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.25), new THREE.MeshStandardMaterial({ color: 0x212121 })); laptop.position.set(0.9, 0.79, 0); g.add(laptop);
    return g;
  }

  /* ---------------- window ---------------- */
  V3.open = async function (opts = {}) {
    if (!S.cs) await A.actions.runCansat({ silent: true });
    const ex = UI.getWindow('scene3d');
    if (ex) { ex.focus(); if (opts.deploy) V3.deploy(); return; }
    UI.window({
      id: 'scene3d', title: 'CanSat Deployment — 3D Simulation', icon: 'cansat',
      width: Math.min(1240, window.innerWidth - 30), height: Math.min(800, window.innerHeight - 30),
      onClose: () => dispose(),
      content: (body, api) => buildUI(body, api, opts)
    });
  };

  function buildUI(body, api, opts) {
    body.classList.add('v3-win');
    const sel = (id, options, val, title) => {
      const s = el('select', { id, title });
      options.forEach(([v, l]) => { const o = el('option', { value: v, text: l }); if (String(v) === String(val)) o.selected = true; s.appendChild(o); });
      return s;
    };
    const chk = (id, label, on) => { const c = el('input', { type: 'checkbox', id }); c.checked = on; return el('label', { class: 'v3-chk' }, [c, el('span', { text: label })]); };
    const bar = el('div', { class: 'v3-bar' }, [
      el('button', { class: 'btn primary v3-deploy', id: 'v3Deploy', html: '🚀 Deploy', title: 'Run a new deployment (new gust realisation) and replay it' }),
      el('button', { class: 'btn', id: 'v3Play', text: '⏸ Pause' }),
      el('button', { class: 'btn', id: 'v3Restart', text: '⟲ Restart' }),
      el('span', { class: 'v3-sep' }),
      el('label', {}, ['Speed ', sel('v3Speed', [[1, '1× (real time)'], [2, '2×'], [4, '4×'], [8, '8×'], [16, '16×']], 4)]),
      el('label', {}, ['Camera ', sel('v3Cam', [['orbit', 'Free orbit'], ['follow', 'Follow CanSat'], ['gs', 'Ground-station view'], ['top', 'Top-down'], ['side', 'Side (drift plane)']], 'follow')]),
      el('label', {}, ['Ground ', sel('v3Img', [['esri', 'Satellite'], ['topo', 'Topographic'], ['osm', 'Street map'], ['none', 'Plain']], 'esri')]),
      el('label', {}, ['Relief ', sel('v3Ex', [[1, '1×'], [2, '2×'], [3, '3×']], 1)]),
      el('label', { title: 'Enlarge the drone, can and parachute so they are visible at site scale' }, ['Models ', sel('v3Ms', [[1, 'true size'], [8, '×8'], [15, '×15'], [25, '×25']], 15)]),
      el('span', { class: 'v3-sep' }),
      chk('v3Paths', 'Possible paths', true), chk('v3Wind', 'Wind', true), chk('v3Steam', 'Vent plume', true), chk('v3Labels', 'Labels', true),
      el('span', { style: { flex: 1 } }),
      el('button', { class: 'btn', id: 'v3Shot', text: '📷 Save figure', title: 'Save the current view as a PNG figure (also added to Figures)' })
    ]);
    const stage = el('div', { class: 'v3-stage' });
    const canvas = el('canvas', { class: 'v3-canvas' });
    const hud = el('div', { class: 'v3-hud' });
    const info = el('div', { class: 'v3-info' });
    const labels = el('div', { class: 'v3-labels' });
    const compass = el('div', { class: 'v3-compass', html: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="27" fill="rgba(0,0,0,.45)" stroke="#fff" stroke-width="1.5"/><g id="v3Needle"><path d="M30 7 L36 30 L30 26 L24 30Z" fill="#ff5252"/><path d="M30 53 L36 30 L30 34 L24 30Z" fill="#fff"/><text x="30" y="17" fill="#fff" font-size="9" text-anchor="middle" font-family="Segoe UI" font-weight="700">N</text></g></svg>' });
    const legend = el('div', { class: 'v3-legend' });
    const loading = el('div', { class: 'v3-loading', html: '<span class="spinner"></span><span id="v3Status">Loading three.js…</span>' });
    const attr = el('div', { class: 'v3-attr' });
    stage.append(canvas, labels, hud, info, compass, legend, attr, loading);
    const tbar = el('div', { class: 'v3-time' }, [
      el('span', { class: 'mono', id: 'v3T', text: 'MET 0.0 s' }),
      el('div', { class: 'v3-track' }, [el('div', { class: 'v3-phases', id: 'v3Phases' }), el('input', { type: 'range', id: 'v3Slider', min: 0, max: 100, step: 0.1, value: 0 })]),
      el('span', { class: 'mono', id: 'v3Phase', text: 'PRE' })
    ]);
    body.append(bar, stage, tbar);
    init({ body, stage, canvas, hud, info, labels, compass, legend, loading, attr }, opts).catch((e) => {
      console.error(e);
      loading.innerHTML = `<b>3D view could not start:</b> ${U.esc(e.message)}`;
    });
  }

  async function init(dom, opts) {
    const status = (t) => { const s = dom.loading.querySelector('#v3Status'); if (s) s.textContent = t; };
    await loadLibs();
    status('Preparing scene…');
    const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 20000);
    const controls = new THREE.OrbitControls(camera, dom.canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495;
    V = { dom, renderer, scene, camera, controls, t: 0, playing: true, speed: 4, last: performance.now(), cam: 'follow', ms: 15, ex: 1, img: 'esri', deployN: 1 };
    const ro = new ResizeObserver(() => resize()); ro.observe(dom.stage); V.ro = ro;
    resize();
    wireUI();
    await buildWorld(status);
    dom.loading.classList.add('hidden');
    V.raf = requestAnimationFrame(loop);
    if (opts.deploy) V3.deploy();
  }

  function resize() {
    if (!V) return;
    const r = V.dom.stage.getBoundingClientRect();
    V.renderer.setSize(Math.max(50, r.width), Math.max(50, r.height), false);
    V.camera.aspect = Math.max(50, r.width) / Math.max(50, r.height);
    V.camera.updateProjectionMatrix();
  }

  function wireUI() {
    const $ = (id) => document.getElementById(id);
    $('v3Deploy').onclick = () => V3.deploy();
    $('v3Play').onclick = () => { if (V.t >= V.tEnd - 0.01) V.t = 0; V.playing = !V.playing; playLabel(); };
    $('v3Restart').onclick = () => { V.t = 0; V.playing = true; playLabel(); };
    $('v3Speed').onchange = (e) => { V.speed = +e.target.value; };
    $('v3Cam').onchange = (e) => setCam(e.target.value);
    $('v3Img').onchange = async (e) => { V.img = e.target.value; await rebuildTerrain(); };
    $('v3Ex').onchange = async (e) => { V.ex = +e.target.value; await rebuildTerrain(); };
    $('v3Ms').onchange = (e) => { V.ms = +e.target.value; applyModelScale(); };
    $('v3Paths').onchange = (e) => { if (V.dyn) V.dyn.paths.visible = e.target.checked; };
    $('v3Wind').onchange = (e) => { if (V.wind) { V.wind.group.visible = e.target.checked; } };
    $('v3Steam').onchange = (e) => { if (V.steam) V.steam.group.visible = e.target.checked; };
    $('v3Labels').onchange = (e) => { V.dom.labels.classList.toggle('hidden', !e.target.checked); };
    $('v3Slider').oninput = (e) => { V.t = +e.target.value; V.playing = false; playLabel(); };
    $('v3Shot').onclick = () => snapshot(true);
  }
  function playLabel() { const b = document.getElementById('v3Play'); if (b) b.textContent = V.playing ? '⏸ Pause' : '▶ Play'; }

  /* ---------------- world (terrain + static objects) ---------------- */
  function extentHalf() {
    const r = S.cs, mc = S.mc, c = S.cfg;
    let m = 250;
    if (mc) mc.points.forEach(([x, y]) => (m = Math.max(m, Math.hypot(x, y))));
    const gs = U.llToLocal(c.site.lat, c.site.lon, c.gs.lat, c.gs.lon), vt = U.llToLocal(c.site.lat, c.site.lon, c.vent.lat, c.vent.lon);
    m = Math.max(m, Math.hypot(...gs), Math.hypot(...vt), r ? r.landing.dist : 0);
    return U.clamp(Math.ceil((m + 150) / 50) * 50, 300, 1200);
  }
  async function buildWorld(status) {
    const { scene } = V;
    const env = S.cs.env;
    scene.background = skyTexture();
    const sun = sunDir(S.cfg.flightTime, S.cfg.site.lat, S.cfg.site.lon);
    V.half = extentHalf();
    scene.fog = new THREE.Fog(0xdfeaf3, V.half * 2.2, V.half * 6);
    scene.add(new THREE.HemisphereLight(0xe3f2fd, 0x5d4037, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, sun.day ? 0.9 : 0.35);
    const el0 = Math.max(sun.el, 12 * DEG);
    dl.position.set(Math.sin(sun.az) * Math.cos(el0) * 1000, Math.sin(el0) * 1000, -Math.cos(sun.az) * Math.cos(el0) * 1000);
    scene.add(dl);
    V.sun = sun;
    V.site = { ...S.cfg.site };
    await rebuildTerrain(status);
    buildStatic();
    buildFlight();
    buildWind(env);
    buildSteam(env);
    setCam(V.cam, true);
  }
  function skyTexture() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#6fa8dc'); gr.addColorStop(0.65, '#bcd9f1'); gr.addColorStop(1, '#e8f1f8');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  async function rebuildTerrain(status) {
    status = status || ((t) => { V.dom.loading.classList.remove('hidden'); const s = V.dom.loading.querySelector('#v3Status'); if (s) s.textContent = t; });
    const T = await loadTerrain(V.site, V.half, V.img, status);
    V.dom.loading.classList.add('hidden');
    if (V.terrain) { V.scene.remove(V.terrain); V.terrain.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    const half = V.half, seg = 150, ex = V.ex;
    const geo = new THREE.PlaneGeometry(2 * half, 2 * half, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const H = new Float32Array((seg + 1) * (seg + 1));
    let minH = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const e = pos.getX(i), n = -pos.getZ(i);
      const [la, lo] = U.offsetLL(V.site.lat, V.site.lon, e, n);
      const h = (T.elevAt(la, lo) - T.h0) * ex;
      H[i] = h; minH = Math.min(minH, h);
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    let mat;
    if (T.texCanvas) {
      const tex = new THREE.CanvasTexture(T.texCanvas);
      tex.encoding = THREE.sRGBEncoding; tex.anisotropy = V.renderer.capabilities.getMaxAnisotropy();
      mat = new THREE.MeshLambertMaterial({ map: tex });
    } else mat = new THREE.MeshLambertMaterial({ color: 0x7cb342 });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, mat));
    // diorama skirt
    const base = minH - 25;
    const skirtPts = [];
    const edge = (fn) => { for (let k = 0; k < seg; k++) { const [a, b] = [fn(k), fn(k + 1)]; skirtPts.push(a, b, base); } };
    const vtx = (i, j) => new THREE.Vector3(-half + 2 * half * i / seg, H[j * (seg + 1) + i], -half + 2 * half * j / seg);
    const quads = [];
    const addStrip = (list) => { for (let k = 0; k < list.length - 1; k++) { const a = list[k], b = list[k + 1]; quads.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, base, b.z, a.x, a.y, a.z, b.x, base, b.z, a.x, base, a.z); } };
    const row = (j) => Array.from({ length: seg + 1 }, (_, i) => vtx(i, j)), colm = (i) => Array.from({ length: seg + 1 }, (_, j) => vtx(i, j));
    addStrip(row(0)); addStrip(row(seg).reverse()); addStrip(colm(0).reverse()); addStrip(colm(seg));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(quads, 3)); sg.computeVertexNormals();
    group.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0x6d4c41, side: THREE.DoubleSide })));
    void skirtPts; void edge;
    V.scene.add(group);
    V.terrain = group;
    V.H = H; V.seg = seg; V.demOK = T.demOK;
    V.heightAt = (e, n) => {
      const fi = U.clamp((e + half) / (2 * half) * seg, 0, seg), fj = U.clamp((-n + half) / (2 * half) * seg, 0, seg);
      const i = Math.min(seg - 1, Math.floor(fi)), j = Math.min(seg - 1, Math.floor(fj)), ax = fi - i, ay = fj - j, W = seg + 1;
      return H[j * W + i] * (1 - ax) * (1 - ay) + H[j * W + i + 1] * ax * (1 - ay) + H[(j + 1) * W + i] * (1 - ax) * ay + H[(j + 1) * W + i + 1] * ax * ay;
    };
    V.dom.attr.textContent = `${T.attr ? T.attr + ' · ' : ''}${T.demOK ? 'Elevation: Terrarium (SRTM) via AWS Open Data' : 'Elevation unavailable — flat ground'}${ex > 1 ? ` · relief ×${ex}` : ''}`;
    if (V.dyn) { buildStatic(); buildFlight(); buildWind(S.cs.env); buildSteam(S.cs.env); }
  }

  /* static site furniture: launch pad, GS, vent, range rings, north arrow */
  function buildStatic() {
    if (V.stat) { V.scene.remove(V.stat); V.stat.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const g = new THREE.Group();
    const c = S.cfg, hA = V.heightAt;
    const P = (e, n, up = 0) => new THREE.Vector3(e, hA(e, n) + up, -n);
    // launch pad
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshBasicMaterial({ color: 0x1565c0, transparent: true, opacity: 0.85 }));
    pad.rotation.x = -Math.PI / 2; pad.position.copy(P(0, 0, 0.15)); g.add(pad);
    const hmark = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff })); hmark.rotation.x = -Math.PI / 2; hmark.position.copy(P(0, 0, 0.2)); g.add(hmark);
    // range rings following the terrain
    [50, 100, 200, 400].filter((r) => r < V.half).forEach((r) => {
      const pts = []; for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2; pts.push(P(Math.cos(a) * r, Math.sin(a) * r, 0.4)); }
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.8 }));
      ln.computeLineDistances(); g.add(ln);
    });
    // ground station
    const [gx, gy] = U.llToLocal(c.site.lat, c.site.lon, c.gs.lat, c.gs.lon);
    const gs = buildGS(); gs.position.copy(P(gx, gy)); gs.scale.setScalar(Math.max(1, V.ms / 5)); g.add(gs);
    V.gsAnt = P(gx, gy, 2.6 * Math.max(1, V.ms / 5));
    // vent
    const [vx, vy] = U.llToLocal(c.site.lat, c.site.lon, c.vent.lat, c.vent.lon);
    const vent = new THREE.Mesh(new THREE.RingGeometry(2, 4.5, 24), new THREE.MeshBasicMaterial({ color: 0xb8860b, side: THREE.DoubleSide })); vent.rotation.x = -Math.PI / 2; vent.position.copy(P(vx, vy, 0.3)); g.add(vent);
    V.ventPos = P(vx, vy, 1);
    // north arrow on the ground
    const na = V.half * 0.8;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(8, 22, 3), new THREE.MeshBasicMaterial({ color: 0xff5252 })); arrow.rotation.x = -Math.PI / 2; arrow.position.copy(P(0, na, 3)); g.add(arrow);
    V.scene.add(g); V.stat = g;
    // labels
    V.dom.labels.innerHTML = '';
    V.lbl = {
      launch: { pos: P(0, 0, 4), n: textLabel(V.dom.labels, 'Launch / release', 'blue') },
      gs: { pos: P(gx, gy, 6), n: textLabel(V.dom.labels, 'Ground station', 'green') },
      vent: { pos: P(vx, vy, 5), n: textLabel(V.dom.labels, 'Hot-spring vent', 'gold') },
      north: { pos: P(0, na, 20), n: textLabel(V.dom.labels, 'N', 'north') }
    };
    [50, 100, 200, 400].filter((r) => r < V.half).forEach((r) => { V.lbl['r' + r] = { pos: P(r * 0.707, -r * 0.707, 2), n: textLabel(V.dom.labels, `${r} m`, 'ring') }; });
  }

  /* dynamic flight objects: trail, packets, can, chute, drone, MC paths, ellipse, exclusion */
  function disposeGroup(g) { if (!g) return; V.scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); }
  function buildFlight() {
    if (V.dyn) disposeGroup(V.dyn.group);
    const r = S.cs, mc = S.mc, hA = V.heightAt;
    const P = (x, y, z) => new THREE.Vector3(x, z + hA(x, y), -y);
    const group = new THREE.Group();
    // trail tube coloured by phase / SO2
    const tr = r.track;
    const pts = tr.map((p) => P(p.x, p.y, Math.max(p.z, 0.3)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const segs = pts.length - 1, rad = 6;
    const tube = new THREE.TubeGeometry(curve, segs, 0.35 + V.ms * 0.02, rad, false);
    const cols = [];
    const recAt = (t) => r.recs[Math.min(r.recs.length - 1, Math.max(0, Math.floor(t)))];
    for (let i = 0; i <= segs; i++) {
      const p = tr[Math.min(i, tr.length - 1)], rec = recAt(p.t);
      const c = p.t >= r.tRel ? so2Color(rec.so2ppb) : col(PHASE_COL[rec.phase] || '#8e44ad');
      for (let k = 0; k <= rad; k++) cols.push(c.r, c.g, c.b);
    }
    tube.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const trail = new THREE.Mesh(tube, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 }));
    tube.setDrawRange(0, 0);
    group.add(trail);
    // packets (instanced spheres)
    const flying = r.recs.filter((p) => p.phase !== 'PRE');
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5 + V.ms * 0.03, 10, 8), new THREE.MeshLambertMaterial(), flying.length);
    const m4 = new THREE.Matrix4();
    flying.forEach((p, i) => {
      m4.makeTranslation(p.x, Math.max(p.altTrue, 0.5) + hA(p.x, p.y), -p.y); inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col(p.rx ? '#2e7d32' : '#d32f2f'));
    });
    inst.count = 0; group.add(inst);
    // Monte-Carlo possible paths
    const paths = new THREE.Group();
    mc.paths.forEach((pp) => {
      const g = new THREE.BufferGeometry().setFromPoints(pp.map(([x, y, z]) => P(x, y, Math.max(z, 0.2))));
      paths.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7e57c2, transparent: true, opacity: 0.28 })));
    });
    const lp = new THREE.BufferGeometry().setFromPoints(mc.points.map(([x, y]) => P(x, y, 0.4)));
    paths.add(new THREE.Points(lp, new THREE.PointsMaterial({ color: 0x6a1b9a, size: 1.6 + V.ms * 0.05, sizeAttenuation: true })));
    paths.visible = document.getElementById('v3Paths') ? document.getElementById('v3Paths').checked : true;
    group.add(paths);
    // 95 % ellipse & exclusion zone
    const loop = (xy, up) => xy.map(([x, y]) => P(x, y, up));
    const ell = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loop(mc.ellipseXY, 0.6)), new THREE.LineBasicMaterial({ color: 0x6a1b9a }));
    group.add(ell);
    const exc = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loop(mc.exclusionXY, 0.6)), new THREE.LineDashedMaterial({ color: 0xe53935, dashSize: 3, gapSize: 2 }));
    exc.computeLineDistances(); group.add(exc);
    // predicted (mean) landing pin
    const pin = new THREE.Mesh(new THREE.ConeGeometry(1.2 + V.ms * 0.08, 5 + V.ms * 0.3, 16), new THREE.MeshLambertMaterial({ color: 0x6a1b9a }));
    const mp = P(mc.mean[0], mc.mean[1], 0); pin.position.copy(mp).add(new THREE.Vector3(0, (5 + V.ms * 0.3) / 2, 0)); pin.rotation.x = Math.PI; group.add(pin);
    // drift arrow launch → mean landing (on the ground)
    const drift = new THREE.ArrowHelper(new THREE.Vector3(mc.mean[0], 0, -mc.mean[1]).normalize(), P(0, 0, 1), Math.max(3, mc.meanDist), 0x6a1b9a, Math.min(8, mc.meanDist * 0.3), Math.min(5, mc.meanDist * 0.18));
    group.add(drift);
    // actual touchdown marker (shown after landing)
    const td = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.6 + V.ms * 0.1, 32), new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide }));
    td.rotation.x = -Math.PI / 2; td.position.copy(P(r.landing.x, r.landing.y, 0.5)); td.visible = false; group.add(td);
    // can, chute, drone
    const can = buildCanSat(), chute = buildChute(S.cfg.canopyD), drone = buildDrone();
    const canG = new THREE.Group(); canG.add(can); canG.add(chute); chute.visible = false;
    group.add(canG); group.add(drone);
    // drop line to the ground
    const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.5, gapSize: 1 }));
    group.add(drop);
    // LoRa link line
    const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x43a047, transparent: true, opacity: 0.9 }));
    group.add(link);
    V.scene.add(group);
    V.dyn = { group, trail, tube, rad, segs, inst, flying, paths, can, chute, canG, drone, drop, link, td };
    V.tEnd = tr[tr.length - 1].t;
    V.relHover = r.track.find((p) => p.t >= r.tRel) || tr[0];
    const sl = document.getElementById('v3Slider'); if (sl) sl.max = V.tEnd.toFixed(1);
    phaseBar();
    applyModelScale();
    // labels for landing
    V.lbl.pred = { pos: P(mc.mean[0], mc.mean[1], 8 + V.ms * 0.4), n: textLabel(V.dom.labels, `Most likely landing · ${mc.meanDist.toFixed(0)} m ${U.compass(mc.meanBrg)}`, 'purple') };
    V.lbl.can = { pos: new THREE.Vector3(), n: textLabel(V.dom.labels, 'CanSat', 'can') };
    V.lbl.drone = { pos: new THREE.Vector3(), n: textLabel(V.dom.labels, 'F450 drone', 'drone') };
    renderInfo();
    renderLegend();
  }
  function applyModelScale() {
    if (!V.dyn) return;
    V.dyn.can.scale.setScalar(V.ms); V.dyn.chute.userData.base = V.ms; V.dyn.drone.scale.setScalar(V.ms);
  }
  function phaseBar() {
    const r = S.cs, pb = document.getElementById('v3Phases');
    if (!pb) return;
    const segs = [];
    let cur = null, start = 0;
    r.recs.forEach((p) => { if (p.phase !== cur) { if (cur) segs.push([cur, start, p.met]); cur = p.phase; start = p.met; } });
    segs.push([cur, start, V.tEnd]);
    pb.innerHTML = segs.map(([ph, a, b]) => `<span title="${ph}" style="left:${(a / V.tEnd * 100).toFixed(2)}%;width:${((b - a) / V.tEnd * 100).toFixed(2)}%;background:${PHASE_COL[ph]}">${b - a > V.tEnd * 0.08 ? ph : ''}</span>`).join('');
  }

  /* wind field: profile column of arrows + drifting streaks */
  function buildWind(env) {
    if (V.wind) disposeGroup(V.wind.group);
    const group = new THREE.Group();
    const hA = V.heightAt;
    const heights = [5, 15, 30, 50, 75, 100, 125];
    const off = -Math.min(40, V.half * 0.15);
    heights.forEach((h) => {
      const [u, v] = CS.windUV(env, h), s = Math.hypot(u, v);
      const dir = new THREE.Vector3(u, 0, -v).normalize();
      const c = s < 2 ? 0x81d4fa : s < 4 ? 0x29b6f6 : s < 7 ? 0x0277bd : 0x6a1b9a;
      group.add(new THREE.ArrowHelper(dir, new THREE.Vector3(off, hA(off, 0) + h, 0), 6 + s * 7, c, 4, 2.6));
    });
    const pole = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(off, hA(off, 0), 0), new THREE.Vector3(off, hA(off, 0) + 130, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    group.add(pole);
    // streaks
    const N = 420, pos = new Float32Array(N * 6), P = [];
    const rnd = U.mulberry32(99);
    for (let i = 0; i < N; i++) P.push({ x: (rnd() * 2 - 1) * V.half * 0.9, y: (rnd() * 2 - 1) * V.half * 0.9, z: 3 + rnd() * 140 });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    group.add(lines);
    group.visible = document.getElementById('v3Wind') ? document.getElementById('v3Wind').checked : true;
    V.scene.add(group);
    const [u1, v1] = CS.windUV(env, 100);
    V.lbl.wind = { pos: new THREE.Vector3(off, hA(off, 0) + 135, 0), n: textLabel(V.dom.labels, `Wind profile · ${Math.hypot(u1, v1).toFixed(1)} m/s @100 m from ${U.compass(U.uvToWsWd(u1, v1)[1])}`, 'wind') };
    V.wind = { group, P, pos, g, env };
  }
  function updateWind(dt) {
    if (!V.wind || !V.wind.group.visible) return;
    const { P, pos, g, env } = V.wind, h = V.half * 0.9, hA = V.heightAt;
    const k = dt * Math.min(V.speed, 8) * 2.5;
    P.forEach((p, i) => {
      const [u, v] = CS.windUV(env, p.z);
      p.x += u * k; p.y += v * k;
      if (p.x > h) p.x -= 2 * h; if (p.x < -h) p.x += 2 * h; if (p.y > h) p.y -= 2 * h; if (p.y < -h) p.y += 2 * h;
      const base = hA(p.x, p.y) + p.z, L = 1.6;
      pos.set([p.x, base, -p.y, p.x - u * L, base, -(p.y - v * L)], i * 6);
    });
    g.attributes.position.needsUpdate = true;
  }

  /* hot-spring vent steam (age-binned point clouds for fading) */
  function buildSteam(env) {
    if (V.steam) disposeGroup(V.steam.group);
    const group = new THREE.Group(), bins = [];
    const spr = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    [0.55, 0.38, 0.22, 0.1].forEach((op, b) => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: spr, size: 6 + b * 6, transparent: true, opacity: op, depthWrite: false, color: 0xf5f5f5 }));
      group.add(pts); bins.push(pts);
    });
    const parts = []; const rnd = U.mulberry32(7);
    for (let i = 0; i < 260; i++) parts.push({ age: rnd() * 40, jx: rnd() - 0.5, jy: rnd() - 0.5 });
    group.visible = document.getElementById('v3Steam') ? document.getElementById('v3Steam').checked : true;
    V.scene.add(group);
    V.steam = { group, bins, parts, env, life: 40 };
  }
  function updateSteam(dt) {
    if (!V.steam || !V.steam.group.visible) return;
    const { bins, parts, env, life } = V.steam, vp = V.ventPos;
    const [u, v] = CS.windUV(env, 8);
    const counts = [0, 0, 0, 0];
    parts.forEach((p) => {
      p.age += dt * Math.min(V.speed, 8);
      if (p.age > life) p.age -= life;
      const a = p.age, b = Math.min(3, Math.floor(a / life * 4));
      const spread = 1 + a * 0.9;
      const x = vp.x + u * a + p.jx * spread * 2, y = vp.y + Math.min(25, 1.2 * a) + p.jy * spread, z = vp.z - v * a + p.jy * spread * 2;
      const arr = bins[b].geometry.attributes.position.array, i = counts[b]++;
      if (i < 200) { arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; }
    });
    bins.forEach((pts, b) => { pts.geometry.setDrawRange(0, Math.min(200, counts[b])); pts.geometry.attributes.position.needsUpdate = true; });
  }

  /* ---------------- per-frame flight update ---------------- */
  function stateAt(t) {
    const tr = S.cs.track;
    let i = Math.min(tr.length - 2, Math.max(0, Math.floor(t / 0.5)));
    while (i < tr.length - 2 && tr[i + 1].t < t) i++;
    while (i > 0 && tr[i].t > t) i--;
    const a = tr[i], b = tr[i + 1], f = U.clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
    const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
    const vx = (b.x - a.x) / (b.t - a.t), vy = (b.y - a.y) / (b.t - a.t), vz = (b.z - a.z) / (b.t - a.t);
    return { x, y, z, vx, vy, vz, idx: i + f };
  }
  function updateFlight(t) {
    const d = V.dyn, r = S.cs, hA = V.heightAt;
    const st = stateAt(t);
    const ground = hA(st.x, st.y);
    const pos = new THREE.Vector3(st.x, Math.max(st.z, 0) + ground, -st.y);
    d.canG.position.copy(pos);
    const released = t >= r.tRel;
    // chute inflation
    const tr = t - r.tRel;
    if (released && st.z > 0.05) {
      d.chute.visible = true;
      d.chute.position.set(0, 0, 0);
      const a = U.clamp(tr / S.cfg.inflation, 0.05, 1);
      d.chute.scale.set(V.ms * a, V.ms * (0.3 + 0.7 * a), V.ms * a);
      d.chute.rotation.z = Math.sin(t * 1.3) * 0.06; d.chute.rotation.x = Math.cos(t * 1.1) * 0.05;
    } else if (released) { d.chute.visible = true; d.chute.scale.set(V.ms, V.ms * 0.12, V.ms); d.chute.position.set(1.2 * V.ms * 0.3, 0, 0); }
    else { d.chute.visible = false; d.chute.position.set(0, 0, 0); }
    // drone: carries the can until release, holds, then returns home after touchdown
    const off = 0.3 * V.ms;
    let dp;
    if (!released) dp = pos.clone().add(new THREE.Vector3(0, off, 0));
    else {
      const hov = new THREE.Vector3(0, S.cfg.releaseAGL + hA(0, 0) + off, 0);
      const back = t - (r.tLand + 3);
      dp = back > 0 ? hov.clone().setY(Math.max(hA(0, 0) + 0.1 * V.ms, hov.y - back * 3)) : hov;
    }
    d.drone.position.copy(dp);
    const spin = dp.y - hA(0, 0) > 0.12 * V.ms + 0.1;
    d.drone.userData.props.forEach((p, k) => { p.rotation.z += spin ? 0.9 + k * 0.05 : 0; p.material.opacity = spin ? 0.35 : 0.8; });
    // trail
    const segDone = Math.floor(U.clamp(st.idx, 0, d.segs));
    d.tube.setDrawRange(0, segDone * d.rad * 6);
    // packets
    let n = 0; while (n < d.flying.length && d.flying[n].met <= t) n++;
    d.inst.count = n; d.inst.instanceMatrix.needsUpdate = true; if (d.inst.instanceColor) d.inst.instanceColor.needsUpdate = true;
    // drop line
    d.drop.geometry.setFromPoints([pos, new THREE.Vector3(pos.x, ground, pos.z)]); d.drop.computeLineDistances();
    d.drop.visible = st.z > 1;
    // LoRa link flashes with each packet
    const rec = r.recs[Math.min(r.recs.length - 1, Math.floor(t))];
    d.link.geometry.setFromPoints([V.gsAnt, pos]);
    d.link.material.color.set(rec.rx ? 0x43a047 : 0xe53935);
    d.link.material.opacity = 0.25 + 0.7 * Math.max(0, 1 - (t % 1) * 2.5);
    d.td.visible = t >= r.tLand;
    V.cur = { st, pos, dp, rec, t, ground };
  }

  function setCam(mode, init) {
    V.cam = mode;
    const r = S.cs, c = V.camera, ctl = V.controls, hA = V.heightAt;
    const mid = new THREE.Vector3(S.mc.mean[0] / 2, hA(0, 0) + S.cfg.releaseAGL * 0.45, -S.mc.mean[1] / 2);
    ctl.enabled = mode !== 'gs';
    if (mode === 'top') { ctl.target.copy(mid).setY(hA(0, 0)); c.position.set(mid.x + 0.1, hA(0, 0) + Math.max(260, V.half * 1.1), mid.z + 0.1); }
    else if (mode === 'side') {
      const [u, v] = [S.mc.mean[0], S.mc.mean[1]]; const L = Math.hypot(u, v) || 1;
      ctl.target.copy(mid); c.position.set(mid.x - v / L * 260, mid.y + 20, mid.z - u / L * 260);
    } else if (mode === 'orbit' || init || mode === 'follow') {
      ctl.target.copy(mid);
      const brg = (S.mc.meanBrg + 120) * DEG;
      c.position.set(mid.x + Math.sin(brg) * 230, mid.y + 110, mid.z - Math.cos(brg) * 230);
    }
    ctl.update();
    void r;
  }
  function updateCamera() {
    const c = V.camera, ctl = V.controls, cur = V.cur;
    if (!cur) return;
    if (V.cam === 'follow') {
      const target = cur.pos.clone().add(new THREE.Vector3(0, 0.1 * V.ms, 0));
      const offset = c.position.clone().sub(ctl.target);
      ctl.target.lerp(target, 0.15);
      c.position.copy(ctl.target).add(offset);
      if (c.position.y < V.heightAt(c.position.x, -c.position.z) + 5) c.position.y = V.heightAt(c.position.x, -c.position.z) + 5;
    } else if (V.cam === 'gs') {
      c.position.copy(V.gsAnt).add(new THREE.Vector3(0, -0.8, 0));
      c.lookAt(cur.pos);
    }
  }

  /* ---------------- HUD / info / labels ---------------- */
  function updateHUD() {
    const cur = V.cur; if (!cur) return;
    const r = S.cs, st = cur.st, rec = cur.rec, env = r.env;
    const hs = Math.hypot(st.vx, st.vy), hd = (Math.atan2(st.vx, st.vy) / DEG + 360) % 360;
    const [u, v] = CS.windUV(env, Math.max(st.z, 0.5)); const [ws, wd] = U.uvToWsWd(u, v);
    const dist = Math.hypot(st.x, st.y), brg = (Math.atan2(st.x, st.y) / DEG + 360) % 360;
    const phase = rec.phase;
    V.dom.hud.innerHTML = `<div class="v3-h1"><span class="ph" style="background:${PHASE_COL[phase]}">${phase}</span> MET ${cur.t.toFixed(1)} s · ${U.fmtPHT(S.cfg.flightTime + (cur.t - r.tRel) * 1000, true)}</div>
      <table>
      <tr><td>Altitude AGL</td><td><b>${Math.max(0, st.z).toFixed(1)} m</b> <span>baro ${rec.altBaro.toFixed(1)} · GPS ${rec.altGps.toFixed(1)}</span></td></tr>
      <tr><td>Vertical speed</td><td>${(-st.vz).toFixed(2)} m/s ${st.vz < -0.2 ? '↓' : st.vz > 0.2 ? '↑' : ''}</td></tr>
      <tr><td>Drift</td><td>${hs.toFixed(2)} m/s → ${U.compass(hd)} (${hd.toFixed(0)}°)</td></tr>
      <tr><td>Wind here</td><td>${ws.toFixed(1)} m/s from ${U.compass(wd)} (${wd.toFixed(0)}°)</td></tr>
      <tr><td>From launch</td><td>${dist.toFixed(1)} m, bearing ${brg.toFixed(0)}°</td></tr>
      <tr><td>SO₂ · H₂S</td><td>${rec.so2ppb.toFixed(0)} ppb · ${rec.h2s.toFixed(2)} ppm${rec.h2sLOD ? ' (&lt;LOD)' : ''}</td></tr>
      <tr><td>CO₂ · PM2.5</td><td>${rec.co2} ppm · ${rec.pm25} µg/m³</td></tr>
      <tr><td>T · RH · P</td><td>${rec.T.toFixed(1)} °C · ${rec.RH.toFixed(0)} % · ${rec.P.toFixed(1)} hPa</td></tr>
      <tr><td>LoRa</td><td style="color:${rec.rx ? '#9ccc65' : '#ff8a80'}">#${rec.seq} ${rec.rx ? 'received ✓' : 'lost ✗ (microSD)'} · ${rec.dist.toFixed(0)} m</td></tr>
      </table>`;
    const tl = document.getElementById('v3T'); if (tl) tl.textContent = `MET ${cur.t.toFixed(1)} s / ${V.tEnd.toFixed(0)} s`;
    const pl = document.getElementById('v3Phase'); if (pl) pl.textContent = phase;
    const sl = document.getElementById('v3Slider'); if (sl && document.activeElement !== sl) sl.value = cur.t.toFixed(1);
  }
  function renderInfo() {
    const r = S.cs, mc = S.mc, g = S.gng, st = r.stats;
    V.dom.info.innerHTML = `<div class="v3-h1">Deployment #${V.deployN} <span class="pill ${g.verdict === 'GO' ? 'go' : g.verdict === 'NO-GO' ? 'nogo' : 'caution'}">${g.verdict}</span></div>
      <table>
      <tr><td>Release</td><td>${U.fmtPHT(S.cfg.flightTime, true)} · ${S.cfg.releaseAGL} m AGL</td></tr>
      <tr><td>Wind @ release</td><td>${g.wsRel.toFixed(1)} m/s</td></tr>
      <tr><td>Most likely drift</td><td><b>→ ${U.compass(mc.meanBrg)} ${mc.meanDist.toFixed(0)} m</b> (${mc.meanBrg.toFixed(0)}°)</td></tr>
      <tr><td>95 % landing area</td><td>${mc.a.toFixed(0)} × ${mc.b.toFixed(0)} m ellipse · max ${mc.maxDist.toFixed(0)} m</td></tr>
      <tr><td>This deployment</td><td>${r.landing.dist.toFixed(0)} m ${U.compass(r.landing.brg)} · ${st.descentRate.toFixed(2)} m/s · ${r.descentTime.toFixed(1)} s</td></tr>
      <tr><td>Samples · PDR</td><td>${st.descentSamples} @ 1 Hz · ${(st.pdr * 100).toFixed(1)} %</td></tr>
      <tr><td>Canopy</td><td>${S.cfg.canopyD.toFixed(2)} m · ρ ${r.rho.toFixed(3)} kg/m³</td></tr>
      </table>
      <div class="v3-note">Purple lines: ${mc.paths.length} of ${S.cfg.mcRuns} Monte-Carlo descents. Dots are their touchdown points.</div>`;
  }
  function renderLegend() {
    V.dom.legend.innerHTML = `<div><b>Trail</b>: <span class="sw" style="background:#8e44ad"></span>ascent <span class="sw" style="background:linear-gradient(90deg,#2c7bb6,#ffffbf,#d7191c)"></span>descent coloured by SO₂ (0 → 60 ppb)</div>
      <div><span class="dot" style="background:#2e7d32"></span>packet received <span class="dot" style="background:#d32f2f"></span>lost · <span class="sw" style="background:#7e57c2"></span>possible paths · <span class="sw" style="background:#6a1b9a"></span>95 % ellipse · <span class="sw" style="background:#e53935"></span>exclusion zone · <span class="sw" style="background:#fff;border:1px solid #999"></span>wind streaks</div>`;
  }
  function updateLabels() {
    if (!V.lbl) return;
    const cur = V.cur, w = V.dom.stage.clientWidth, h = V.dom.stage.clientHeight;
    if (cur) {
      V.lbl.can.pos.copy(cur.pos).add(new THREE.Vector3(0, 0.25 * V.ms + (S.cs && cur.t >= S.cs.tRel ? S.cfg.canopyD * 1.6 * V.ms : 0), 0));
      V.lbl.can.n.innerHTML = `CanSat · ${Math.max(0, cur.st.z).toFixed(0)} m`;
      V.lbl.drone.pos.copy(cur.dp).add(new THREE.Vector3(0, 0.15 * V.ms, 0));
    }
    const v = new THREE.Vector3();
    Object.values(V.lbl).forEach((L) => {
      v.copy(L.pos).project(V.camera);
      const vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      L.n.style.display = vis ? '' : 'none';
      if (vis) L.n.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`;
    });
    // compass
    const dir = V.controls.target.clone().sub(V.camera.position);
    const heading = Math.atan2(dir.x, -dir.z) / DEG;
    const nd = document.getElementById('v3Needle'); if (nd) nd.setAttribute('transform', `rotate(${(-heading).toFixed(1)} 30 30)`);
  }

  /* ---------------- loop ---------------- */
  function loop(now) {
    if (!V) return;
    V.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - V.last) / 1000); V.last = now;
    if (V.playing) {
      V.t += dt * V.speed;
      if (V.t >= V.tEnd) { V.t = V.tEnd; V.playing = false; playLabel(); }
    }
    updateFlight(V.t);
    updateWind(dt);
    updateSteam(dt);
    updateCamera();
    if (V.cam !== 'gs') V.controls.update();
    V.renderer.render(V.scene, V.camera);
    updateLabels();
    updateHUD();
  }

  /* ---------------- deploy / snapshot / dispose ---------------- */
  V3.deploy = async function () {
    if (!V) { await V3.open({ deploy: false }); }
    const b = document.getElementById('v3Deploy'); if (b) { b.disabled = true; b.textContent = 'Deploying…'; }
    try {
      S.cfg.seed = (S.cfg.seed || 1) + 1;
      await A.actions.runCansat({ silent: true });
      if (!V) return;
      V.deployN++;
      const moved = U.haversine(V.site.lat, V.site.lon, S.cfg.site.lat, S.cfg.site.lon) > 5;
      const newHalf = extentHalf();
      if (moved || newHalf > V.half) { V.site = { ...S.cfg.site }; V.half = newHalf; await rebuildTerrain(); }
      buildStatic(); buildFlight(); buildWind(S.cs.env); buildSteam(S.cs.env);
      V.t = 0; V.playing = true; playLabel();
      if (V.cam === 'follow') setCam('follow', true);
    } finally { if (b) { b.disabled = false; b.innerHTML = '🚀 Deploy'; } }
  };

  function snapshot(download) {
    if (!V) return null;
    V.renderer.render(V.scene, V.camera);
    const src = V.renderer.domElement, W = src.width, H = src.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.drawImage(src, 0, 0);
    const k = W / V.dom.stage.clientWidth;
    // labels
    g.font = `600 ${12 * k}px Segoe UI, sans-serif`; g.textAlign = 'center';
    Object.values(V.lbl).forEach((L) => {
      if (L.n.style.display === 'none') return;
      const v = L.pos.clone().project(V.camera);
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H - 6 * k;
      g.lineWidth = 3 * k; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(L.n.textContent, x, y); g.fillStyle = '#fff'; g.fillText(L.n.textContent, x, y);
    });
    // title strip
    const r = S.cs, mc = S.mc;
    g.textAlign = 'left'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, 30 * k);
    g.fillStyle = '#fff'; g.font = `600 ${14 * k}px Segoe UI, sans-serif`;
    g.fillText(`AERIS CanSat deployment — ${U.fmtPHT(S.cfg.flightTime, true)} · most likely drift ${U.compass(mc.meanBrg)} ${mc.meanDist.toFixed(0)} m · 95 % ellipse ${mc.a.toFixed(0)}×${mc.b.toFixed(0)} m`, 10 * k, 20 * k);
    g.font = `${10 * k}px Segoe UI, sans-serif`; g.fillStyle = 'rgba(255,255,255,.9)';
    g.fillText(V.dom.attr.textContent + ' · models ×' + V.ms, 10 * k, H - 8 * k);
    const url = cv.toDataURL('image/png');
    const caption = `3D view of a simulated AERIS CanSat deployment at ${D.site.name} (${U.fmtPHT(S.cfg.flightTime, true)}). The drone climbs at ${S.cfg.ascentRate} m/s to ${S.cfg.releaseAGL} m AGL and releases the payload, which descends at ${r.stats.descentRate.toFixed(2)} m/s under a ${S.cfg.canopyD.toFixed(2)} m canopy and drifts ${U.compass(mc.meanBrg)}. The descent trail is coloured by the simulated SO₂ reading; purple lines are ${mc.paths.length} Monte-Carlo descents; the purple ellipse encloses 95 % of ${S.cfg.mcRuns} simulated landings and the dashed red line is the exclusion zone. Models are enlarged ×${V.ms} for visibility.`;
    if (AERIS.figures) AERIS.figures.setSnapshot(url, caption);
    if (download) U.downloadURL(`aeris_cansat_3d_${new Date(S.cfg.flightTime + 8 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '')}.png`, url);
    return url;
  }
  V3.snapshot = snapshot;

  function dispose() {
    if (!V) return;
    cancelAnimationFrame(V.raf);
    if (V.ro) V.ro.disconnect();
    V.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
    V.controls.dispose();
    V.renderer.dispose();
    V = null;
  }
  V3.isOpen = () => !!V;
})();

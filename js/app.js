/* AERIS-GIS — application core: state, map layers, layer tree, rendering, temporal controller, tools */
(function () {
  'use strict';
  const U = AERIS.U, D = AERIS.data, MET = AERIS.met, ML = AERIS.maplayers, UI = AERIS.ui;
  const el = U.el;
  const A = AERIS.app = { actions: {} };

  const S = A.S = {
    map: null, species: 'SO2', results: {}, activeSpecies: null,
    traj: null, back: null, attribution: [],
    cs: null, mc: null, gng: null, point: null, campaign: null,
    timeline: [], ti: 0, playing: false, playTimer: null, loop: true, speed: 700,
    tool: 'pan', pick: null, measure: null, identifyMarker: null, hl: null,
    crs: U.lsGet('aeris.crs', '4326'),
    theme: U.lsGet('aeris.theme', 'default'),
    deco: Object.assign({ title: true, north: true, scale: true, legend: true, grid: false }, U.lsGet('aeris.deco', {})),
    style: Object.assign({ ramp: 'YlOrRd', rasterOpacity: 0.72, contour: 'lines', continuous: true, particleColor: 'height',
      particleSize: 2, particleOpacity: 0.85, windLevel: 3, units: 'mix' }, U.lsGet('aeris.style', {})),
    lg: {}, overlays: {}
  };
  const saveStyle = () => U.lsSet('aeris.style', S.style);

  /* default CanSat configuration (proposal values) */
  (function initCfg() {
    const site = { lat: D.site.lat, lon: D.site.lon };
    const gs = U.offsetLL(site.lat, site.lon, -35, -20);
    const vent = U.destination(site.lat, site.lon, 160, 150);
    S.cfg = {
      site, gs: { lat: gs[0], lon: gs[1] }, vent: { lat: vent[0], lon: vent[1], H: 3, q: { H2S: 0.8, SO2: 0.06, CO2: 20 } },
      releaseAGL: 100, ascentRate: 2.5, hoverSec: 10, preSec: 5, landedSec: 8,
      mass: 0.35, cd: 1.5, canopyD: 0.55, inflation: 1.2, targetV: 4.0,
      lora: { b0: 4.2, b1: -0.0028, b2: 1.6 }, mcRuns: 300, exclusion: 50, seed: 1, flightTime: null
    };
  })();

  /* ---------------- layer tree definition ---------------- */
  const TREE = [
    { id: 'g-model', group: true, name: 'AERIS Dispersion Output', expanded: true, visible: true, children: [
      { id: 'particles', name: 'Particles (HYSPLIT-style)', icon: 'lParticles', visible: true, legend: 'particles' },
      { id: 'contours', name: 'Iso-concentration contours', icon: 'lPoly', visible: true },
      { id: 'conc', name: 'Concentration 0–100 m AGL', icon: 'lRaster', visible: true, legend: 'conc', expanded: true },
      { id: 'maxconc', name: 'Maximum concentration (whole run)', icon: 'lRaster', visible: false, legend: 'conc' },
      { id: 'arrival', name: 'Plume arrival time', icon: 'lRaster', visible: false, legend: 'arrival' },
      { id: 'traj', name: 'Forward trajectories', icon: 'lLine', visible: true, legend: 'traj' },
      { id: 'back', name: 'Backward trajectories (CanSat site)', icon: 'lLine', visible: true, legend: 'back' }
    ] },
    { id: 'g-cansat', group: true, name: 'CanSat Mission — Mainit/Toyozu', expanded: true, visible: true, children: [
      { id: 'cs-points', name: 'Launch site · ground station · vent', icon: 'lPoint', visible: true, legend: 'cspoints' },
      { id: 'cs-track', name: 'Descent track (1 Hz packets)', icon: 'lLine', visible: true, legend: 'track' },
      { id: 'cs-mc', name: 'Landing dispersion (95 % ellipse)', icon: 'lPoly', visible: true },
      { id: 'cs-excl', name: 'Exclusion zone (≥ 50 m)', icon: 'lPoly', visible: true },
      { id: 'cs-lora', name: 'LoRa 90 % reception range', icon: 'lPoly', visible: false },
      { id: 'cs-local', name: 'Local vent plume footprint', icon: 'lPoly', visible: true }
    ] },
    { id: 'g-src', group: true, name: 'Sources & Receptors', expanded: true, visible: true, children: [
      { id: 'volcanoes', name: 'PHIVOLCS volcanoes', icon: 'lVolc', visible: true, legend: 'volc' },
      { id: 'receptors', name: 'Receptor towns', icon: 'lPoint', visible: true }
    ] },
    { id: 'g-met', group: true, name: 'Meteorology (NWP)', expanded: false, visible: true, children: [
      { id: 'wind', name: 'Wind vectors', icon: 'wind', visible: true, legend: 'wind' },
      { id: 'pbl', name: 'Boundary-layer height', icon: 'lRaster', visible: false, legend: 'pbl' },
      { id: 'metgrid', name: 'Met grid nodes (nest / parent)', icon: 'lMesh', visible: false }
    ] },
    { id: 'g-terrain', group: true, name: 'Terrain — DEM (Copernicus / NASADEM)', expanded: true, visible: true, children: [
      { id: 'dem-contours', name: 'Contour lines', icon: 'lLine', visible: false, legend: 'dem-contours' },
      { id: 'dem-bands', name: 'Contour polygons', icon: 'lPoly', visible: false, legend: 'dem-bands' },
      { id: 'dem-hill', name: 'Hillshade', icon: 'lRaster', visible: false, legend: 'dem-hill' },
      { id: 'dem-relief', name: 'Elevation heat map', icon: 'lRaster', visible: false, legend: 'dem-relief', expanded: true },
      { id: 'dem-slope', name: 'Slope (°)', icon: 'lRaster', visible: false, legend: 'dem-slope' },
      { id: 'dem-aspect', name: 'Aspect', icon: 'lRaster', visible: false, legend: 'dem-aspect' }
    ] },
    { id: 'g-base', group: true, name: 'XYZ Tiles', exclusive: true, expanded: false, visible: true,
      children: ML.basemaps.map((b) => ({ id: 'bm-' + b.id, name: b.name, icon: 'lXYZ', visible: b.id === U.lsGet('aeris.basemap', 'osm'), basemap: b })) }
  ];
  const LAYERS = A.LAYERS = {};
  (function walk(nodes, parent) { nodes.forEach((n) => { n.parent = parent; LAYERS[n.id] = n; if (n.children) walk(n.children, n); }); })(TREE, null);
  if (!LAYERS['g-base'].children.some((c) => c.visible)) LAYERS['g-base'].children[0].visible = true;

  const isVisible = (id) => { let n = LAYERS[id]; while (n) { if (!n.visible) return false; n = n.parent; } return true; };
  A.isVisible = isVisible;
  function syncLayer(id) {
    const node = LAYERS[id];
    if (node.children) { node.children.forEach((c) => syncLayer(c.id)); return; }
    const lg = S.lg[id];
    if (!lg || !S.map) return;
    const vis = isVisible(id);
    if (vis && !S.map.hasLayer(lg)) S.map.addLayer(lg);
    if (!vis && S.map.hasLayer(lg)) S.map.removeLayer(lg);
  }
  A.setVisible = function (id, v) {
    const node = LAYERS[id];
    if (node.parent && node.parent.exclusive && v) node.parent.children.forEach((c) => { c.visible = c.id === id; syncLayer(c.id); });
    else node.visible = v;
    if (node.basemap && v) U.lsSet('aeris.basemap', node.basemap.id);
    syncLayer(id);
    renderTree();
    renderLegendDeco();
    if (A.onVisibility) A.onVisibility(id, v);
  };

  const activeResult = A.activeResult = () => (S.activeSpecies ? S.results[S.activeSpecies] : null);
  const sp = () => D.species[S.activeSpecies || S.species];
  const unitLabel = (spId) => (S.style.units === 'ug' ? 'µg/m³' : D.mixUnit(spId));
  A.fmtConc = function (spId, ug, withBoth) {
    if (!isFinite(ug)) return '—';
    const mix = D.toMixing(spId, ug);
    const a = S.style.units === 'ug' ? `${U.fmtSig(ug)} µg/m³` : `${U.fmtSig(mix)} ${D.mixUnit(spId)}`;
    if (!withBoth) return a;
    return S.style.units === 'ug' ? `${a} (${U.fmtSig(mix)} ${D.mixUnit(spId)})` : `${a} (${U.fmtSig(ug)} µg/m³)`;
  };
  const classLabel = (spId, v) => (S.style.units === 'ug' ? U.fmtSig(v) : U.fmtSig(D.toMixing(spId, v)));

  /* ---------------- tree rendering (Layers panel) ---------------- */
  let selLayer = 'conc';
  function legendHTML(kind, node) {
    const R = activeResult();
    const spId = R ? R.species : S.species;
    const s = D.species[spId];
    const ramp = D.ramps[S.style.ramp];
    const row = (sw, txt) => `<div class="lg">${sw}<span>${txt}</span></div>`;
    const box = (c) => `<span class="sw" style="background:${c}"></span>`;
    const line = (c, dash) => `<span class="sw line" style="background:${dash ? `repeating-linear-gradient(90deg,${c} 0 5px,transparent 5px 8px)` : c}"></span>`;
    const dot = (c) => `<span class="sw dot" style="background:${c}"></span>`;
    switch (kind) {
      case 'conc': return s.classes.map((c, i) => row(box(ramp[i]), `≥ ${classLabel(spId, c)} ${unitLabel(spId)}${s.notes[c] ? ` <span class="muted">· ${s.notes[c]}</span>` : ''}`)).join('');
      case 'particles':
        if (S.style.particleColor === 'height') return D.heightClasses.map((h) => row(dot(h.color), h.label)).join('');
        if (S.style.particleColor === 'age') return AGE.map((a) => row(dot(a.color), a.label)).join('');
        return (R ? R.sources : []).map((src, i) => row(dot(SRC_COL[i % SRC_COL.length]), U.esc(src.name))).join('') || '<div class="lg muted">no run</div>';
      case 'arrival': return arrClasses(R).map((c, i) => row(box(ARR.colors[i]), `≥ ${c} h after release start`)).join('');
      case 'traj': return (S.traj || []).filter((t, i, a) => a.findIndex((x) => x.height === t.height) === i).map((t) => row(line(t.color), `${t.height} m above vent`)).join('') || '<div class="lg muted">not run</div>';
      case 'back': return (S.back || []).map((t) => row(line(t.color, true), `${t.height} m AGL, arriving at site`)).join('') || '<div class="lg muted">not run</div>';
      case 'volc': return row('<span class="lico">' + UI.icon('lVolc') + '</span>', 'Priority: Mt. Apo, Mt. Leonard Kniaseff') +
        row(`<svg width="16" height="12" viewBox="0 0 24 24"><path d="M12 3L22 20H2Z" fill="#f16913" stroke="#fff"/></svg>`, 'Active (PHIVOLCS)') +
        row(`<svg width="16" height="12" viewBox="0 0 24 24"><path d="M12 3L22 20H2Z" fill="#a0785a" stroke="#fff"/></svg>`, 'Potentially active');
      case 'wind': return WIND.classes.map((c, i) => row(line(WIND.colors[i]), i < WIND.classes.length - 1 ? `${c}–${WIND.classes[i + 1]} m/s` : `≥ ${c} m/s`)).join('') +
        `<div class="lg muted">Level: ${MET.LEVELS[S.style.windLevel].label}</div>`;
      case 'pbl': return PBL.classes.map((c, i) => row(box(PBL.colors[i]), `≥ ${c} m`)).join('');
      case 'track': return row(dot('#2e7d32'), 'Packet received (CRC OK)') + row(dot('#d32f2f'), 'Packet lost → filled from microSD') + row(line('#6a1b9a', true), 'Drone ascent / hover');
      case 'cspoints': return row(dot('#1565c0'), 'Launch / release point') + row(dot('#2e7d32'), 'Ground station (LoRa RX)') + row(dot('#b8860b'), 'Hot-spring vent (local source)') + row(dot('#6a1b9a'), 'Predicted landing');
      default: return A.extraLegend ? A.extraLegend(kind) : '';
    }
  }
  function renderTree() {
    const root = document.getElementById('layerTree');
    root.innerHTML = '';
    const R = activeResult();
    const spId = R ? R.species : S.species;
    LAYERS.conc.name = `${D.species[spId].label} concentration 0–${R ? R.params.layerTop : 100} m AGL (${unitLabel(spId)})`;
    LAYERS.maxconc.name = `${D.species[spId].label} maximum over run (${unitLabel(spId)})`;
    LAYERS.wind.name = `Wind vectors — ${MET.LEVELS[S.style.windLevel].label}`;
    const badge = (id) => {
      if (id === 'particles' && R) { const sn = R.snaps[S.ti]; return sn ? U.fmtNum(sn.lat.length) : ''; }
      if (id === 'traj' && S.traj) return String(S.traj.length);
      if (id === 'back' && S.back) return String(S.back.length);
      if (id === 'cs-track' && S.cs) return S.cs.recs.length + ' pkts';
      if (id === 'volcanoes') return String(D.volcanoes.length);
      if (id === 'receptors') return String(D.receptors.length);
      return '';
    };
    function build(nodes, parentUl) {
      nodes.forEach((n) => {
        const li = el('li');
        const hasKids = !!(n.children || n.legend);
        const row = el('div', { class: 'row' + (selLayer === n.id ? ' selected' : '') + (n.group ? ' grp' : ''), 'data-id': n.id });
        const tw = el('span', { class: 'tw' + (hasKids ? '' : ' leaf'), text: n.expanded ? '▼' : '▶' });
        tw.addEventListener('click', (e) => { e.stopPropagation(); n.expanded = !n.expanded; renderTree(); });
        const exclusive = n.parent && n.parent.exclusive;
        const cb = el('input', { type: exclusive ? 'radio' : 'checkbox', name: exclusive ? 'bm' : undefined });
        cb.checked = n.visible;
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => A.setVisible(n.id, cb.checked));
        row.append(tw, cb, el('span', { class: 'lico', html: UI.icon(n.group ? 'lGroup' : n.icon) }),
          el('span', { class: 'lname' + (n.group ? ' group' : ''), text: n.name, title: n.name }), el('span', { class: 'badge', text: n.group ? '' : badge(n.id) }));
        row.addEventListener('click', () => { selLayer = n.id; renderTree(); if (A.renderStyling) A.renderStyling(); });
        row.addEventListener('dblclick', () => { if (!n.group) A.zoomToLayer(n.id); });
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); selLayer = n.id; renderTree(); layerContext(n, e.clientX, e.clientY); });
        li.appendChild(row);
        if (n.expanded && n.legend) li.appendChild(el('div', { class: 'legend', html: legendHTML(n.legend, n) }));
        if (n.expanded && n.children) { const ul = el('ul'); build(n.children, ul); li.appendChild(ul); }
        parentUl.appendChild(li);
      });
    }
    build(TREE, root);
  }
  A.renderTree = renderTree;
  A.selectedLayer = () => selLayer;

  function layerContext(n, x, y) {
    const X = A.actions;
    const items = [];
    if (!n.group) items.push({ label: 'Zoom to Layer', icon: 'zoomLayer', action: () => A.zoomToLayer(n.id) });
    if (['cs-track', 'receptors', 'volcanoes', 'back', 'traj'].includes(n.id)) items.push({ label: 'Open Attribute Table', icon: 'table', action: () => X.attributeTable({ 'cs-track': 'sd', receptors: 'receptors', volcanoes: 'volcanoes', back: 'attribution', traj: 'trajpts' }[n.id]) });
    items.push({ label: 'Layer Styling…', icon: 'brush', action: () => A.showRight('styling') });
    const exp = { contours: () => X.exportContours(false), maxconc: () => X.exportContours(true), particles: () => X.exportParticles(), traj: () => X.exportTraj(), back: () => X.exportTraj(),
      'cs-track': () => X.exportCansatGeo(), 'cs-mc': () => X.exportCansatGeo(), 'cs-excl': () => X.exportCansatGeo(), volcanoes: () => X.exportPoints(), receptors: () => X.exportPoints() }[n.id];
    if (exp) items.push('-', { label: 'Export ▸ Save Features As GeoJSON…', icon: 'save', action: exp });
    if (n.group) items.push({ label: n.expanded ? 'Collapse' : 'Expand', action: () => { n.expanded = !n.expanded; renderTree(); } });
    if (A.layerContextExtra) A.layerContextExtra(n, items);
    UI.contextMenu(x, y, items);
  }

  /* ---------------- symbology constants ---------------- */
  const SRC_COL = ['#d7191c', '#2c7bb6', '#1a9641', '#984ea3', '#ff7f00', '#a65628', '#f781bf'];
  const AGE = [{ max: 3, color: '#b10026', label: '0–3 h old' }, { max: 6, color: '#fc4e2a', label: '3–6 h' }, { max: 12, color: '#feb24c', label: '6–12 h' },
    { max: 24, color: '#41ab5d', label: '12–24 h' }, { max: 1e9, color: '#225ea8', label: '> 24 h' }];
  const ARR = { classes: [1, 3, 6, 9, 12, 18, 24, 36], colors: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#d1e5f0', '#92c5de', '#4393c3'] };
  const arrClasses = (R) => (R && R.params.hours > 48 ? [1, 6, 12, 24, 48, 72, 120, 168] : ARR.classes);
  A.arrClasses = arrClasses;
  const WIND = { classes: [0, 2, 4, 7, 10], colors: ['#7fb3d5', '#2e86c1', '#1b4f72', '#7d3c98', '#c0392b'] };
  const PBL = { classes: [0, 300, 600, 900, 1200, 1600], colors: ['#f7fbff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'] };
  A.SRC_COL = SRC_COL;

  /* ---------------- map & layers ---------------- */
  function initMap() {
    const map = S.map = ML.createMap('map');
    S.scale = L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 160 });
    if (S.deco.scale) S.scale.addTo(map);
    ML.basemaps.forEach((b) => {
      S.lg['bm-' + b.id] = L.tileLayer(b.url, { maxZoom: 19, maxNativeZoom: b.max, attribution: b.attr, subdomains: 'abc', crossOrigin: true });
    });
    ['conc', 'maxconc', 'arrival', 'contours', 'traj', 'back', 'cs-points', 'cs-track', 'cs-mc', 'cs-excl', 'cs-lora', 'cs-local', 'volcanoes', 'receptors']
      .forEach((id) => { S.lg[id] = L.layerGroup(); });
    S.lg.particles = new ML.CanvasLayer(drawParticles, { pane: 'particles', opacity: S.style.particleOpacity });
    S.lg.wind = new ML.CanvasLayer(drawWind, { pane: 'wind' });
    S.lg.pbl = new ML.CanvasLayer(drawPBL, { pane: 'raster', opacity: 0.55 });
    S.lg.metgrid = new ML.CanvasLayer(drawMetGrid, { pane: 'grat' });
    if (AERIS.terrain) AERIS.terrain.init(map);
    S.graticule = ML.graticule();
    if (S.deco.grid) S.graticule.addTo(map);
    Object.keys(LAYERS).forEach((id) => { if (!LAYERS[id].children) syncLayer(id); });
    renderVolcanoes(); renderReceptors();
    A.renderCansatPoints && A.renderCansatPoints();

    if (A.initMapControls) A.initMapControls(map);
    // keep Leaflet's cached size in sync with dock / splitter / window changes
    if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(document.getElementById('canvasArea'));
    map.on('mousemove', (e) => updateCoord(e.latlng));
    map.on('zoomend moveend', () => { updateScale(); labelDensity(); });
    map.on('click', onMapClick);
    map.on('contextmenu', (e) => {
      if (S.tool === 'measure' && S.measure) { finishMeasure(); return; }
      if (S.tool === 'profile' && AERIS.terrain && AERIS.terrain.profileFinish()) return;
      const ll = e.latlng;
      UI.contextMenu(e.originalEvent.clientX, e.originalEvent.clientY, [
        { header: U.fmtLL(ll.lat, ll.lng) },
        { label: 'Identify here', icon: 'identify', action: () => identifyAt(ll) },
        { label: 'Copy coordinates', action: () => { navigator.clipboard && navigator.clipboard.writeText(`${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`); UI.status('Coordinates copied'); } },
        '-',
        { label: 'Forward trajectory from here…', icon: 'traj', action: () => A.actions.trajDialog({ lat: ll.lat, lon: ll.lng }) },
        { label: 'Set CanSat launch site here', icon: 'cansat', action: () => { S.cfg.site = { lat: ll.lat, lon: ll.lng }; A.renderCansatPoints(); UI.message('CanSat', 'Launch site moved. Re-run the descent simulation to update.', 'info', 5000, { label: 'Run now', run: () => A.actions.runCansat() }); } },
        { label: 'Set ground station here', action: () => { S.cfg.gs = { lat: ll.lat, lon: ll.lng }; A.renderCansatPoints(); } }
      ]);
    });
    updateScale(); labelDensity();
  }

  function labelDensity() {
    const z = S.map.getZoom(), c = S.map.getContainer();
    c.classList.toggle('z-lt7', z < 7);
    c.classList.toggle('z-lt9', z < 9);
    document.querySelectorAll('.aeris-label.small').forEach((n) => (n.style.display = z < 6.5 ? 'none' : ''));
    document.querySelectorAll('.aeris-label.town').forEach((n) => (n.style.display = z < 8 ? 'none' : ''));
  }

  function renderVolcanoes() {
    const g = S.lg.volcanoes; g.clearLayers();
    D.volcanoes.forEach((v) => {
      const m = L.marker([v.lat, v.lon], { icon: ML.volcanoIcon(v), zIndexOffset: v.priority ? 1000 : 0, keyboard: false });
      m.bindPopup(() => volcanoPopup(v), { maxWidth: 320 });
      m.on('popupopen', (e) => {
        const n = e.popup.getElement();
        n.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
          S.map.closePopup();
          const act = b.dataset.act;
          if (act === 'disp') A.actions.dispersionDialog({ sources: [v.id] });
          if (act === 'traj') A.actions.runTrajectories([v.id]);
          if (act === 'quick') A.actions.runQuick([v.id]);
        }));
      });
      g.addLayer(m);
      g.addLayer(L.marker([v.lat, v.lon], { icon: ML.label(v.name, v.priority ? 'pri' : 'small'), interactive: false, keyboard: false }));
    });
  }
  function volcanoPopup(v) {
    const e = v.emis;
    return `<div style="min-width:250px"><b style="font-size:13px">${U.esc(v.name)}</b> <span class="muted">(${U.esc(v.status)})</span>
      <table class="identify-table" style="margin-top:4px">
      <tr><td>Location</td><td>${U.fmtLL(v.lat, v.lon)}</td></tr>
      <tr><td>Province</td><td>${U.esc(v.prov)}</td></tr>
      <tr><td>Summit elevation</td><td>${U.fmtNum(v.elev)} m</td></tr>
      <tr><td>Type</td><td>${U.esc(v.kind || '—')}</td></tr>
      <tr><td>Scenario emission</td><td>SO₂ ${e.SO2} · H₂S ${e.H2S} · CO₂ ${e.CO2} t/d</td></tr>
      ${v.note ? `<tr><td>Notes</td><td style="white-space:normal">${U.esc(v.note)}</td></tr>` : ''}
      </table>
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
      <button class="btn small" data-act="quick">Quick 24 h run</button>
      <button class="btn small" data-act="disp">Dispersion…</button>
      <button class="btn small" data-act="traj">Trajectories</button></div></div>`;
  }
  function renderReceptors() {
    const g = S.lg.receptors; g.clearLayers();
    D.receptors.forEach((r) => {
      const m = L.circleMarker([r.lat, r.lon], { radius: 3.5, color: '#222', weight: 1, fillColor: '#fff', fillOpacity: 1 });
      m.bindTooltip(() => {
        const R = activeResult();
        let txt = `<b>${U.esc(r.name)}</b>`;
        if (R) {
          const rec = R.receptors.find((x) => x.name === r.name);
          if (rec) {
            const cur = rec.series[S.ti];
            txt += `<br>${R.species === 'CO2' ? 'CO₂ excess' : D.species[R.species].label} now: ${A.fmtConc(R.species, cur)}<br>max: ${A.fmtConc(R.species, rec.max)}${rec.tMax ? ' at ' + U.fmtPHT(rec.tMax) : ''}`;
          }
        }
        return txt;
      }, { className: 'aeris-tip', direction: 'top', offset: [0, -4] });
      g.addLayer(m);
      g.addLayer(L.marker([r.lat, r.lon], { icon: ML.label(r.name, 'town'), interactive: false, keyboard: false }));
    });
  }

  /* ---------------- canvas layer painters ---------------- */
  function heightColor(z) { for (const h of D.heightClasses) if (z < h.max) return h.color; return '#2b83ba'; }
  function ageColor(a) { for (const h of AGE) if (a < h.max) return h.color; return '#225ea8'; }
  function drawParticles(ctx, map, size) {
    const R = activeResult();
    if (!R) return;
    const sn = R.snaps[S.ti];
    if (!sn) return;
    const b = map.getBounds().pad(0.05);
    const s = S.style.particleSize, mode = S.style.particleColor;
    const n = sn.lat.length;
    // draw high particles first so near-surface ones (CanSat layer) sit on top
    const order = Array.from({ length: n }, (_, i) => i);
    if (mode === 'height') order.sort((a, c) => sn.z[c] - sn.z[a]);
    for (const i of order) {
      const la = sn.lat[i], lo = sn.lon[i];
      if (la < b.getSouth() || la > b.getNorth() || lo < b.getWest() || lo > b.getEast()) continue;
      const p = map.latLngToContainerPoint([la, lo]);
      ctx.fillStyle = mode === 'height' ? heightColor(sn.z[i]) : mode === 'age' ? ageColor(sn.age[i]) : SRC_COL[sn.src[i] % SRC_COL.length];
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  function windColor(s) { let c = WIND.colors[0]; WIND.classes.forEach((k, i) => { if (s >= k) c = WIND.colors[i]; }); return c; }
  function drawWind(ctx, map, size) {
    if (!MET.ready) return;
    const t = A.currentTime();
    const z = map.getZoom();
    const b = map.getBounds().pad(0.1);
    const lvl = S.style.windLevel;
    const grids = MET.grids;
    const nest = grids[0];
    const inNest = (la, lo) => la >= nest.lat0 && la <= nest.lat0 + (nest.nlat - 1) * nest.dlat && lo >= nest.lon0 && lo <= nest.lon0 + (nest.nlon - 1) * nest.dlon;
    const useNest = z >= 6.5;
    grids.forEach((g, gi) => {
      if (gi === 0 && !useNest) return;
      for (let j = 0; j < g.nlat; j++) for (let i = 0; i < g.nlon; i++) {
        const la = g.lat0 + j * g.dlat, lo = g.lon0 + i * g.dlon;
        if (!b.contains([la, lo])) continue;
        if (gi === 1 && useNest && inNest(la, lo)) continue;
        const [u, v] = MET.levelWindAtNode(g, j * g.nlon + i, lvl, t);
        const spd = Math.hypot(u, v);
        const p = map.latLngToContainerPoint([la, lo]);
        const len = Math.min(42, 7 + spd * 3.2);
        const ang = Math.atan2(-v, u);
        const x2 = p.x + Math.cos(ang) * len, y2 = p.y + Math.sin(ang) * len;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = windColor(spd); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.fillStyle = windColor(spd);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(ang - 0.45) * 7, y2 - Math.sin(ang - 0.45) * 7);
        ctx.lineTo(x2 - Math.cos(ang + 0.45) * 7, y2 - Math.sin(ang + 0.45) * 7);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, 7); ctx.fill();
      }
    });
  }
  function drawPBL(ctx, map) {
    if (!MET.ready) return;
    const t = A.currentTime();
    MET.grids.slice().reverse().forEach((g) => {
      for (let j = 0; j < g.nlat; j++) for (let i = 0; i < g.nlon; i++) {
        const la = g.lat0 + j * g.dlat, lo = g.lon0 + i * g.dlon;
        const h = MET.scalarAtNode(g, 'pblh', j * g.nlon + i, t);
        let c = PBL.colors[0]; PBL.classes.forEach((k, q) => { if (h >= k) c = PBL.colors[q]; });
        const p1 = map.latLngToContainerPoint([la + g.dlat / 2, lo - g.dlon / 2]), p2 = map.latLngToContainerPoint([la - g.dlat / 2, lo + g.dlon / 2]);
        ctx.fillStyle = c; ctx.fillRect(p1.x, p1.y, p2.x - p1.x + 0.5, p2.y - p1.y + 0.5);
      }
    });
  }
  function drawMetGrid(ctx, map) {
    if (!MET.ready) return;
    MET.grids.forEach((g, gi) => {
      ctx.strokeStyle = gi === 0 ? '#1565c0' : '#666'; ctx.lineWidth = 1;
      for (let j = 0; j < g.nlat; j++) for (let i = 0; i < g.nlon; i++) {
        const p = map.latLngToContainerPoint([g.lat0 + j * g.dlat, g.lon0 + i * g.dlon]);
        ctx.beginPath(); ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y); ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 3); ctx.stroke();
      }
      const a = map.latLngToContainerPoint([g.lat0 + (g.nlat - 1) * g.dlat, g.lon0]), c = map.latLngToContainerPoint([g.lat0, g.lon0 + (g.nlon - 1) * g.dlon]);
      ctx.setLineDash([6, 4]); ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y); ctx.setLineDash([]);
      ctx.font = '600 11px Segoe UI, sans-serif'; ctx.fillStyle = gi === 0 ? '#1565c0' : '#444';
      ctx.fillText(g.name + ` (${g.nlat}×${g.nlon})`, a.x + 4, a.y + 13);
    });
  }

  /* ---------------- time / frames ---------------- */
  A.currentTime = () => S.timeline[S.ti] || Date.now();
  A.buildTimeline = function () {
    const R = activeResult();
    if (R) S.timeline = R.frames.map((f) => f.t);
    else if (MET.ready) {
      const [a, b] = MET.timeRange();
      const now = Math.max(a, Math.floor(Date.now() / 3600e3) * 3600e3);
      S.timeline = [];
      for (let t = now; t <= Math.min(b, now + 48 * 3600e3); t += 3600e3) S.timeline.push(t);
    } else S.timeline = [Math.floor(Date.now() / 3600e3) * 3600e3];
    S.ti = U.clamp(S.ti, 0, S.timeline.length - 1);
    renderTemporal();
  };

  A.renderTime = function () {
    const R = activeResult();
    const t = A.currentTime();
    const cacheKey = S.style.ramp + (S.style.continuous ? 'c' : 'd');
    if (R) {
      const f = R.frames[S.ti];
      const classes = D.species[R.species].classes, ramp = D.ramps[S.style.ramp];
      if (f) {
        f.img = f.img || {};
        if (!f.img[cacheKey]) f.img[cacheKey] = ML.rasterURL(R.grid, f.conc, classes, ramp, S.style.continuous);
        setOverlay('conc', f.img[cacheKey], S.style.rasterOpacity);
        S.lg.contours.clearLayers();
        if (S.style.contour !== 'off') {
          const fc = ML.contours(R.grid, f.conc, classes);
          S.lg.contours.addLayer(contourLayer(fc, R.species));
        }
      }
    } else { S.lg.conc.clearLayers(); S.lg.contours.clearLayers(); S.overlays.conc = null; }
    S.lg.particles.redraw(); S.lg.wind.redraw(); S.lg.pbl.redraw();
    renderDecoTitle();
    renderTemporalLabel();
    if (A.renderForecast) A.renderForecast(true);
    const badge = document.querySelector('#layerTree .row[data-id="particles"] .badge');
    if (badge) badge.textContent = R && R.snaps[S.ti] ? U.fmtNum(R.snaps[S.ti].lat.length) : '';
  };
  function setOverlay(id, img, opacity) {
    const cur = S.overlays[id];
    if (cur && S.lg[id].hasLayer(cur)) { cur.setUrl(img.url); cur.setBounds(L.latLngBounds(img.bounds)); cur.setOpacity(opacity); return; }
    S.lg[id].clearLayers();
    S.overlays[id] = L.imageOverlay(img.url, img.bounds, { pane: 'raster', opacity, interactive: false, className: 'aeris-raster' });
    S.lg[id].addLayer(S.overlays[id]);
  }
  const darken = (hex, f) => { const [r, g, b] = ML.hex2rgb(hex); return `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`; };
  function contourLayer(fc, spId) {
    const ramp = D.ramps[S.style.ramp], s = D.species[spId];
    const filled = S.style.contour === 'filled';
    return L.geoJSON(fc, {
      pane: 'contours',
      style: (f) => ({ color: darken(ramp[f.properties.cls], filled ? 0.7 : 0.62), weight: filled ? 0.8 : 1.3, fill: filled, fillColor: ramp[f.properties.cls], fillOpacity: filled ? 0.5 : 0 }),
      onEachFeature: (f, l) => l.bindTooltip(`${s.label} ≥ ${classLabel(spId, f.properties.level)} ${unitLabel(spId)}${s.notes[f.properties.level] ? ' — ' + s.notes[f.properties.level] : ''}`, { sticky: true, className: 'aeris-tip' })
    });
  }
  A.renderStatic = function () {
    // rasters that do not change with time
    const R = activeResult();
    S.lg.maxconc.clearLayers(); S.lg.arrival.clearLayers(); S.overlays.maxconc = S.overlays.arrival = null;
    if (!R) return;
    const s = D.species[R.species];
    setOverlay('maxconc', ML.rasterURL(R.grid, R.maxConc, s.classes, D.ramps[S.style.ramp], S.style.continuous), 0.75);
    setOverlay('arrival', ML.rasterURL(R.grid, R.arrival, arrClasses(R), ARR.colors, false), 0.7);
  };

  /* ---------------- decorations ---------------- */
  function renderDecoTitle() {
    const d = document.getElementById('decoTitle');
    d.classList.toggle('hidden', !S.deco.title);
    const R = activeResult(), t = A.currentTime();
    if (R) {
      const s = D.species[R.species];
      d.innerHTML = `${s.label} ${R.outH || 1}-h mean, 0–${R.params.layerTop} m AGL · valid ${U.fmtUTC(t)} (${U.fmtPHT(t, true)})` +
        `<small>Sources: ${R.sources.map((x) => `${U.esc(x.name)} ${x.rate} t/d`).join(', ')} · ${U.esc(MET.describe().split(' · ')[0])} · HYSPLIT-style Lagrangian model</small>`;
    } else {
      d.innerHTML = `Wind ${MET.LEVELS[S.style.windLevel].label} · ${U.fmtUTC(t)} (${U.fmtPHT(t, true)})<small>${U.esc(MET.describe())}</small>`;
    }
    document.getElementById('decoNorth').classList.toggle('hidden', !S.deco.north);
  }
  function renderLegendDeco() {
    const box = document.getElementById('decoLegend');
    const R = activeResult();
    if (!S.deco.legend || !R || !isVisible('conc')) { box.classList.add('hidden'); return; }
    const s = D.species[R.species], ramp = D.ramps[S.style.ramp];
    box.classList.remove('hidden');
    box.innerHTML = `<b>${s.label} (${unitLabel(R.species)})</b><div class="cb">${ramp.map((c) => `<span style="background:${c}"></span>`).join('')}</div>` +
      `<div class="cbl">${s.classes.map((c) => `<span>${classLabel(R.species, c)}</span>`).join('')}</div>`;
  }
  A.renderLegendDeco = renderLegendDeco;
  A.toggleDeco = function (k) {
    S.deco[k] = !S.deco[k]; U.lsSet('aeris.deco', S.deco);
    if (k === 'scale') { if (S.deco.scale) S.scale.addTo(S.map); else S.scale.remove(); }
    if (k === 'grid') { if (S.deco.grid) S.graticule.addTo(S.map); else S.graticule.remove(); }
    renderDecoTitle(); renderLegendDeco();
  };

  /* ---------------- temporal controller ---------------- */
  function renderTemporal() {
    const row = document.getElementById('tcRow');
    if (!row.dataset.built) {
      row.dataset.built = '1';
      const b = (ico, title, fn, id) => el('button', { class: 'tbtn', title, id, html: UI.icon(ico), onclick: fn });
      row.append(
        b('first', 'Rewind to start', () => A.setFrame(0)),
        b('stepB', 'Previous frame (←)', () => A.setFrame(S.ti - 1)),
        b('play', 'Play / pause animation (Space)', () => A.togglePlay(), 'tcPlay'),
        b('stepF', 'Next frame (→)', () => A.setFrame(S.ti + 1)),
        b('last', 'Skip to end', () => A.setFrame(S.timeline.length - 1)),
        el('input', { type: 'range', id: 'tcSlider', min: 0, max: 0, value: 0, oninput: (e) => A.setFrame(+e.target.value) }),
        el('span', { class: 'tc-time', id: 'tcTime' }),
        el('span', { class: 'muted', id: 'tcFrame' }),
        el('label', { title: 'Jump to a day of the timeline (PHT)' }, [el('span', { text: 'Day' }), (() => {
          const s = el('select', { id: 'tcDay' });
          s.addEventListener('change', () => { const i = S.timeline.findIndex((t) => dayKey(t) === s.value); if (i >= 0) A.setFrame(i); });
          return s;
        })()]),
        el('button', { class: 'btn small', id: 'tcPeriod', title: 'Change the forecast / analysis dates', onclick: () => A.actions.periodDialog() }),
        el('label', {}, [el('span', { text: 'Step' }), el('span', { class: 'tc-time', id: 'tcStep', text: '1 h' })]),
        el('label', {}, [(() => { const c = el('input', { type: 'checkbox' }); c.checked = S.loop; c.addEventListener('change', () => (S.loop = c.checked)); return c; })(), el('span', { text: 'Loop' })]),
        el('label', {}, [el('span', { text: 'Speed' }), (() => {
          const s = el('select');
          [['1400', '0.5×'], ['700', '1×'], ['350', '2×'], ['160', '4×']].forEach(([v, l]) => { const o = el('option', { value: v, text: l }); if (+v === S.speed) o.selected = true; s.appendChild(o); });
          s.addEventListener('change', () => { S.speed = +s.value; if (S.playing) { A.togglePlay(); A.togglePlay(); } });
          return s;
        })()])
      );
    }
    const sl = document.getElementById('tcSlider');
    sl.max = Math.max(0, S.timeline.length - 1); sl.value = S.ti;
    // day selector (PHT calendar days covered by the timeline)
    const ds = document.getElementById('tcDay');
    ds.innerHTML = '';
    [...new Set(S.timeline.map(dayKey))].forEach((k) => ds.appendChild(el('option', { value: k, text: dayLabel(k) })));
    const R = activeResult();
    document.getElementById('tcStep').textContent = `${R ? R.outH || 1 : 1} h`;
    document.getElementById('tcPeriod').textContent = '📅 ' + MET.periodLabel();
    renderTemporalLabel();
  }
  const dayKey = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
  const dayLabel = (k) => new Date(k + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  A.dayKey = dayKey; A.dayLabel = dayLabel;
  function renderTemporalLabel() {
    const t = A.currentTime();
    const R = activeResult();
    const rel = R ? ` (+${Math.round((t - R.params.startMs) / 3600e3)} h)` : '';
    const tt = document.getElementById('tcTime');
    if (tt) tt.textContent = `${U.fmtUTC(t)} · ${U.fmtPHT(t)}${rel}`;
    const tf = document.getElementById('tcFrame');
    if (tf) tf.textContent = `Frame ${S.ti + 1} / ${S.timeline.length}`;
    const sl = document.getElementById('tcSlider');
    if (sl) sl.value = S.ti;
    const ds = document.getElementById('tcDay');
    if (ds && ds.value !== dayKey(t)) ds.value = dayKey(t);
  }
  A.setFrame = function (i) {
    if (!S.timeline.length) return;
    if (i >= S.timeline.length) i = S.loop ? 0 : S.timeline.length - 1;
    if (i < 0) i = S.loop ? S.timeline.length - 1 : 0;
    S.ti = i;
    A.renderTime();
  };
  A.togglePlay = function () {
    S.playing = !S.playing;
    const b = document.getElementById('tcPlay');
    if (b) b.innerHTML = UI.icon(S.playing ? 'pause' : 'play');
    clearInterval(S.playTimer);
    if (S.playing) S.playTimer = setInterval(() => {
      if (!S.loop && S.ti >= S.timeline.length - 1) { A.togglePlay(); return; }
      A.setFrame(S.ti + 1);
    }, S.speed);
  };

  /* ---------------- status bar ---------------- */
  const CRS = { '4326': 'EPSG:4326', '32651': 'EPSG:32651', '3857': 'EPSG:3857' };
  function initStatusBar() {
    const sb = document.getElementById('statusbar');
    const loc = el('div', { class: 'locator', title: 'Locator (Ctrl+K): volcanoes, towns, coordinates, algorithms' }, [
      el('span', { html: UI.icon('search', 'width="14" height="14"') }),
      el('input', { id: 'locator', placeholder: 'Type to locate (Ctrl+K)', autocomplete: 'off' })]);
    sb.append(loc,
      el('span', { class: 'sb-msg', id: 'sbMsg', text: 'Ready' }),
      el('span', { class: 'sb-progress hidden', id: 'sbProgress', html: '<i></i>' }),
      el('span', { class: 'sb-lbl hide-sm', text: 'Coordinate' }), el('span', { class: 'sb-field coord hide-sm', id: 'sbCoord', text: '—' }),
      el('span', { class: 'sb-lbl hide-sm', text: 'Elevation', title: 'Terrain elevation under the cursor (needs a loaded DEM: Raster ▸ Terrain)' }),
      el('span', { class: 'sb-field elev hide-sm', id: 'sbElev', text: '—', title: 'Terrain elevation under the cursor (needs a loaded DEM: Raster ▸ Terrain)' }),
      el('span', { class: 'sb-lbl hide-sm', text: 'Scale' }),
      el('span', { class: 'sb-field scale hide-sm' }, [el('input', { id: 'sbScale', title: 'Type a scale (e.g. 1:250000) and press Enter' })]),
      el('span', { class: 'sb-lbl hide-sm', text: 'Magnifier' }), el('span', { class: 'sb-field hide-sm', text: '100%' }),
      el('span', { class: 'sb-lbl hide-sm', text: 'Rotation' }), el('span', { class: 'sb-field hide-sm', text: '0.0 °' }),
      el('label', { class: 'sb-btn hide-sm', title: 'Toggle map rendering of model layers' }, [(() => {
        const c = el('input', { type: 'checkbox', id: 'sbRender' }); c.checked = true;
        c.addEventListener('change', () => ['raster', 'contours', 'particles', 'wind', 'traj', 'cansat'].forEach((p) => (S.map.getPane(p).style.display = c.checked ? '' : 'none')));
        return c;
      })(), el('span', { text: 'Render' })]),
      el('button', { class: 'sb-btn', id: 'sbCrs', title: 'Coordinate reference system for the coordinate read-out (click to change)', html: UI.icon('globe') + `<span>${CRS[S.crs]}</span>`, onclick: cycleCrs }),
      el('button', { class: 'sb-btn', title: 'Log Messages', html: UI.icon('log') + '<span id="sbLogCount"></span>', onclick: () => A.actions.logWindow() })
    );
    const sc = document.getElementById('sbScale');
    sc.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const m = sc.value.replace(/[, ]/g, '').match(/(?:1:)?(\d+(?:\.\d+)?)/);
      if (m) S.map.setZoom(U.clamp(ML.zoomForScale(S.map, +m[1]), 4, 18));
      sc.blur();
    });
    initLocator();
  }
  function cycleCrs() {
    const order = ['4326', '32651', '3857'];
    S.crs = order[(order.indexOf(S.crs) + 1) % order.length];
    U.lsSet('aeris.crs', S.crs);
    document.querySelector('#sbCrs span').textContent = CRS[S.crs];
    UI.status(`Coordinate display: ${CRS[S.crs]} ${S.crs === '32651' ? '(WGS 84 / UTM zone 51N)' : S.crs === '3857' ? '(WGS 84 / Pseudo-Mercator)' : '(WGS 84)'}`);
  }
  function updateCoord(ll) {
    const c = document.getElementById('sbCoord');
    if (!c) return;
    if (S.crs === '4326') c.textContent = `${ll.lng.toFixed(5)}°E, ${ll.lat.toFixed(5)}°N`;
    else if (S.crs === '3857') { const [x, y] = U.toWebMercator(ll.lat, ll.lng); c.textContent = `${U.fmtNum(x, 1)}, ${U.fmtNum(y, 1)}`; }
    else { const u = U.toUTM(ll.lat, ll.lng); c.textContent = `${U.fmtNum(u.E, 1)}, ${U.fmtNum(u.N, 1)}`; }
    if (S.measure && S.measure.pts.length) A.measureMove && A.measureMove(ll);
    if (AERIS.terrain) { AERIS.terrain.cursor(ll); if (S.tool === 'profile') AERIS.terrain.profileMove(ll); }
  }
  function updateScale() {
    const s = document.getElementById('sbScale');
    if (s && document.activeElement !== s) s.value = '1:' + U.fmtNum(Math.round(ML.scaleDenominator(S.map) / 100) * 100);
  }

  /* ---------------- locator (Ctrl+K) ---------------- */
  function initLocator() {
    const inp = document.getElementById('locator');
    let pop = null, items = [], act = 0;
    const close = () => { if (pop) pop.remove(); pop = null; };
    const choose = (it) => { close(); inp.value = ''; inp.blur(); it.run(); };
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      close();
      if (!q) return;
      items = [];
      const coord = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
      if (coord) {
        let a = +coord[1], b = +coord[2];
        if (Math.abs(a) > 90) [a, b] = [b, a];
        items.push({ grp: 'Coordinates', label: U.fmtLL(a, b), sub: 'go to', run: () => { S.map.setView([a, b], Math.max(S.map.getZoom(), 11)); identifyAt(L.latLng(a, b)); } });
      }
      D.volcanoes.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 6).forEach((v) =>
        items.push({ grp: 'Volcanoes (PHIVOLCS)', label: v.name, sub: v.prov, run: () => { S.map.setView([v.lat, v.lon], 11); } }));
      D.receptors.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 6).forEach((r) =>
        items.push({ grp: 'Receptor towns', label: r.name, sub: U.fmtLL(r.lat, r.lon, 3), run: () => S.map.setView([r.lat, r.lon], 12) }));
      if ('cansat mainit toyozu site launch hot spring'.includes(q) || q.includes('cansat') || q.includes('mainit'))
        items.push({ grp: 'Project', label: D.site.name, sub: 'CanSat field site', run: () => A.zoomTo('site') });
      (A.algorithms || []).filter((a) => a.name.toLowerCase().includes(q)).forEach((a) =>
        items.push({ grp: 'Processing algorithms', label: a.name, sub: 'run', run: a.run }));
      if (!items.length) return;
      pop = el('div', { class: 'locator-pop' });
      let lastGrp = null;
      items.forEach((it, i) => {
        if (it.grp !== lastGrp) { pop.appendChild(el('div', { class: 'lh', text: it.grp })); lastGrp = it.grp; }
        const row = el('div', { class: 'li' + (i === 0 ? ' active' : ''), html: `<span>${U.esc(it.label)}</span><small>${U.esc(it.sub || '')}</small>` });
        row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(it); });
        pop.appendChild(row);
      });
      act = 0;
      document.getElementById('menuLayer').appendChild(pop);
      const r = inp.getBoundingClientRect();
      pop.style.left = r.left + 'px';
      pop.style.top = Math.max(4, r.top - pop.offsetHeight - 4) + 'px';
    });
    inp.addEventListener('keydown', (e) => {
      if (!pop) return;
      const rows = pop.querySelectorAll('.li');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        act = U.clamp(act + (e.key === 'ArrowDown' ? 1 : -1), 0, rows.length - 1);
        rows.forEach((r, i) => r.classList.toggle('active', i === act));
      }
      if (e.key === 'Enter') choose(items[act]);
      if (e.key === 'Escape') close();
    });
    inp.addEventListener('blur', () => setTimeout(close, 150));
  }

  /* ---------------- tools: pan / identify / measure / pick ---------------- */
  A.setTool = function (t) {
    S.tool = t;
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    const c = S.map.getContainer();
    c.classList.toggle('identify', t === 'identify');
    c.classList.toggle('measuring', t === 'measure' || t === 'profile');
    if (t !== 'profile' && AERIS.terrain && !UI.getWindow('profile')) AERIS.terrain.profileClear();
    if (t === 'measure') { startMeasure(); UI.status('Measure: click to add points, right-click to finish, Esc to clear'); }
    else if (t === 'profile') { AERIS.terrain.profileStart(); UI.status('Elevation profile: click points along a line, then double-click or right-click to finish (Esc cancels)'); }
    else if (t === 'identify') { UI.status('Identify: click the map to query meteorology and modelled concentration'); A.showRight('identify'); }
    else UI.status('Pan: drag to move the map, scroll to zoom');
  };
  A.pickOnMap = function (label, cb) {
    S.pick = { label, cb };
    S.map.getContainer().classList.add('picking');
    UI.message('Pick on map', `Click the map to set <b>${U.esc(label)}</b>. Press Esc to cancel.`, 'info', 0);
  };
  function cancelPick() {
    if (!S.pick) return;
    S.pick = null;
    S.map.getContainer().classList.remove('picking');
    document.querySelectorAll('#msgbar .msg').forEach((m) => { if (m.textContent.includes('Pick on map')) m.remove(); });
  }
  function onMapClick(e) {
    if (S.pick) { const p = S.pick; cancelPick(); p.cb(e.latlng); return; }
    if (S.tool === 'identify') identifyAt(e.latlng);
    else if (S.tool === 'measure') addMeasurePoint(e.latlng);
    else if (S.tool === 'profile' && AERIS.terrain) AERIS.terrain.profileClick(e.latlng);
  }

  function identifyAt(ll) {
    const lat = ll.lat, lon = ll.lng;
    if (S.identifyMarker) S.identifyMarker.remove();
    S.identifyMarker = L.circleMarker(ll, { radius: 7, color: '#ff0000', weight: 2, fill: false, pane: 'measure' }).addTo(S.map);
    const t = A.currentTime();
    const rows = [];
    const grp = (g) => rows.push(['__grp', g]);
    grp('Location');
    rows.push(['WGS 84', U.fmtLL(lat, lon, 5)]);
    const u = U.toUTM(lat, lon);
    rows.push([`UTM ${u.zone}${u.hemi} (EPSG:${u.epsg})`, `${U.fmtNum(u.E, 0)} E, ${U.fmtNum(u.N, 0)} N`]);
    if (MET.ready) {
      const smp = {};
      const terr = MET.terrainAt(lat, lon);
      rows.push(['Model terrain (met grid)', isFinite(terr) ? `${U.fmtNum(terr)} m` : 'outside met domain']);
      grp(`Meteorology · ${U.fmtUTC(t)}`);
      if (isFinite(terr)) {
        MET.sample(lat, lon, terr + 10, t, smp);
        if (smp.valid) {
          const [ws, wd] = U.uvToWsWd(smp.u, smp.v);
          rows.push(['Wind 10 m AGL', `${ws.toFixed(1)} m/s from ${wd.toFixed(0)}° (${U.compass(wd)})`]);
          const s2 = {};
          MET.sample(lat, lon, 1500, t, s2);
          const [ws2, wd2] = U.uvToWsWd(s2.u, s2.v);
          rows.push(['Wind ~1500 m MSL (850 hPa)', `${ws2.toFixed(1)} m/s from ${wd2.toFixed(0)}° (${U.compass(wd2)})`]);
          rows.push(['Boundary-layer height', `${U.fmtNum(smp.pblh)} m`]);
          rows.push(['Precipitation', `${smp.precip.toFixed(1)} mm/h`]);
          rows.push(['Relative humidity (2 m)', `${smp.rh.toFixed(0)} %`]);
          const cls = AERIS.model.stabilityClass(t, lon, smp.cloud, smp.ws10);
          rows.push(['Pasquill stability', `${cls} — ${AERIS.model.TURB[cls].name}`]);
        } else rows.push(['Meteorology', 'time outside forecast range']);
      }
    }
    const R = activeResult();
    if (R) {
      const s = D.species[R.species];
      grp(`${s.label} dispersion (${R.sources.map((x) => x.name).join(' + ')})`);
      const f = R.frames[S.ti];
      const c = f ? AERIS.model.sampleGrid(R.grid, f.conc, lat, lon) : NaN;
      rows.push([`1-h mean 0–${R.params.layerTop} m AGL`, isFinite(c) ? A.fmtConc(R.species, c, true) : 'outside grid']);
      const mx = AERIS.model.sampleGrid(R.grid, R.maxConc, lat, lon);
      rows.push(['Maximum over run', isFinite(mx) ? A.fmtConc(R.species, mx, true) : '—']);
      const gx = Math.floor((lon - R.grid.lon0) / R.grid.res), gy = Math.floor((R.grid.latN - lat) / R.grid.res);
      const arr = gx >= 0 && gy >= 0 && gx < R.grid.nx && gy < R.grid.ny ? R.arrival[gy * R.grid.nx + gx] : NaN;
      rows.push([`Plume arrival (≥ ${classLabel(R.species, s.classes[0])} ${unitLabel(R.species)})`, isFinite(arr) ? `+${arr} h (${U.fmtPHT(R.params.startMs + arr * 3600e3, true)})` : 'not reached']);
      const exceeded = s.classes.filter((k) => s.notes[k] && mx >= k).map((k) => s.notes[k]);
      if (exceeded.length) rows.push(['Guideline exceeded (1-h, indicative)', exceeded.join('; ')]);
    }
    if (AERIS.terrain) AERIS.terrain.identifyRows(lat, lon, rows);
    grp('Nearest volcano');
    const nv =D.volcanoes.map((v) => ({ v, d: U.haversine(lat, lon, v.lat, v.lon) })).sort((a, b) => a.d - b.d)[0];
    rows.push([nv.v.name, `${(nv.d / 1000).toFixed(1)} km, bearing ${U.bearing(nv.v.lat, nv.v.lon, lat, lon).toFixed(0)}° from vent (${U.compass(U.bearing(nv.v.lat, nv.v.lon, lat, lon))})`]);
    D.volcanoes.filter((v) => v.priority && v !== nv.v).forEach((v) => {
      const d = U.haversine(lat, lon, v.lat, v.lon);
      rows.push([v.name, `${(d / 1000).toFixed(1)} km, bearing ${U.bearing(v.lat, v.lon, lat, lon).toFixed(0)}° from vent`]);
    });
    rows.push(['CanSat launch site', `${(U.haversine(lat, lon, S.cfg.site.lat, S.cfg.site.lon) / 1000).toFixed(2)} km`]);
    S.identify = rows;
    A.showRight('identify');
  }
  function clearIdentify() { S.identify = null; if (S.identifyMarker) S.identifyMarker.remove(); if (A.renderRight) A.renderRight(); }
  A.identifyAt = identifyAt; A.clearIdentify = clearIdentify;

  function startMeasure() {
    clearMeasure();
    S.measure = { pts: [], line: L.polyline([], { color: '#e31a1c', weight: 2, pane: 'measure', dashArray: '6 4' }).addTo(S.map), ghost: L.polyline([], { color: '#e31a1c', weight: 1, pane: 'measure', opacity: 0.6 }).addTo(S.map), marks: L.layerGroup().addTo(S.map), done: false };
    A.actions.measureWindow && A.actions.measureWindow();
  }
  function addMeasurePoint(ll) {
    if (!S.measure || S.measure.done) startMeasure();
    S.measure.pts.push(ll);
    S.measure.line.setLatLngs(S.measure.pts);
    S.measure.marks.addLayer(L.circleMarker(ll, { radius: 3, color: '#e31a1c', fillOpacity: 1, pane: 'measure' }));
    A.actions.measureWindow && A.actions.measureWindow();
  }
  A.measureMove = function (ll) {
    if (!S.measure || S.measure.done || !S.measure.pts.length) return;
    S.measure.ghost.setLatLngs([S.measure.pts[S.measure.pts.length - 1], ll]);
  };
  function finishMeasure() { if (S.measure) { S.measure.done = true; S.measure.ghost.setLatLngs([]); } }
  function clearMeasure() {
    if (!S.measure) return;
    ['line', 'ghost', 'marks'].forEach((k) => S.measure[k].remove());
    S.measure = null;
  }
  A.clearMeasure = clearMeasure; A.finishMeasure = finishMeasure;

  /* ---------------- zoom helpers ---------------- */
  A.zoomTo = function (what) {
    const m = S.map;
    m.invalidateSize({ pan: false });
    if (what === 'ph') m.fitBounds([[4.4, 116.8], [21.2, 127.2]]);
    else if (what === 'priority') m.fitBounds([[6.75, 124.95], [7.75, 126.35]], { padding: [20, 20] });
    else if (what === 'site') m.setView([S.cfg.site.lat, S.cfg.site.lon], 16);
    else { const v = D.volcanoById(what); if (v) m.setView([v.lat, v.lon], 11); }
  };
  A.zoomToLayer = function (id) {
    const R = activeResult();
    const m = S.map;
    if (['conc', 'contours', 'maxconc', 'arrival', 'particles'].includes(id) && R) {
      m.fitBounds([[R.grid.latN - R.grid.ny * R.grid.res, R.grid.lon0], [R.grid.latN, R.grid.lon0 + R.grid.nx * R.grid.res]]); return;
    }
    const lg = S.lg[id];
    if (id.startsWith('bm-')) { A.zoomTo('ph'); return; }
    if (id === 'wind' || id === 'pbl' || id === 'metgrid') { m.fitBounds([[4, 116], [21, 128]]); return; }
    if (lg && lg.getLayers && lg.getLayers().length) {
      try { const b = L.featureGroup(lg.getLayers().filter((l) => l.getLatLng || l.getBounds)).getBounds(); if (b.isValid()) m.fitBounds(b, { padding: [30, 30], maxZoom: 17 }); } catch (e) { /* ignore */ }
    }
  };

  /* ---------------- panels ---------------- */
  A.togglePanel = function (which) {
    const main = document.getElementById('main');
    if (which === 'left') {
      if (window.innerWidth <= 900) main.classList.toggle('show-left-mobile'); else main.classList.toggle('no-left');
    }
    if (which === 'right') main.classList.toggle('no-right');
    if (which === 'temporal') document.getElementById('temporalDock').classList.toggle('hidden');
    setTimeout(() => S.map.invalidateSize(), 50);
  };
  function initSplitters() {
    document.querySelectorAll('.splitter').forEach((sp) => {
      sp.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const side = sp.dataset.side;
        const move = (ev) => {
          const w = side === 'left' ? ev.clientX : window.innerWidth - ev.clientX;
          document.getElementById('main').style.setProperty(side === 'left' ? '--left-w' : '--right-w', U.clamp(w, 200, 620) + 'px');
          S.map.invalidateSize();
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      });
    });
    document.getElementById('closeLeft').addEventListener('click', () => A.togglePanel('left'));
    document.getElementById('closeRight').addEventListener('click', () => A.togglePanel('right'));
    document.getElementById('closeTemporal').addEventListener('click', () => A.togglePanel('temporal'));
    document.querySelector('[data-collapse="browserDock"]').addEventListener('click', (e) => {
      const d = document.getElementById('browserDock');
      const body = d.querySelector('.dock-body');
      body.classList.toggle('hidden');
      d.style.flex = body.classList.contains('hidden') ? '0 0 auto' : '0 0 150px';
      e.currentTarget.textContent = body.classList.contains('hidden') ? '▸' : '▾';
    });
  }

  /* ---------------- busy indicator ---------------- */
  A.busy = function (txt) {
    const b = document.getElementById('busy');
    if (!txt) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    document.getElementById('busyText').textContent = txt;
  };

  A.applyTheme = function (t) {
    S.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    U.lsSet('aeris.theme', t);
    if (A.onThemeChange) A.onThemeChange();
  };

  /* ---------------- keyboard ---------------- */
  function initKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('locator').focus(); return; }
      if (e.key === 'F1' && e.shiftKey && AERIS.tutorial) { e.preventDefault(); AERIS.tutorial.start(0); return; }
      if (e.key === 'F1') { e.preventDefault(); A.actions.help(); return; }
      if (e.key === 'F6') { e.preventDefault(); A.actions.attributeTable(); return; }
      if (e.key === 'F7') { e.preventDefault(); A.showRight('styling'); return; }
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); A.showRight('toolbox'); return; }
      if (typing) return;
      if (e.key === 'Escape') {
        cancelPick();
        if (S.tool === 'measure') { clearMeasure(); A.setTool('pan'); }
        if (S.tool === 'profile' && AERIS.terrain) { AERIS.terrain.profileCancel(); A.setTool('pan'); }
      }
      if (e.key === ' ') { e.preventDefault(); A.togglePlay(); }
      if (e.key === 'ArrowRight') A.setFrame(S.ti + 1);
      if (e.key === 'ArrowLeft') A.setFrame(S.ti - 1);
    });
  }

  /* ---------------- initialisation ---------------- */
  A.init = async function () {
    // desktop app (AERIS-GIS.exe): tell the local launcher this window is alive / closing
    if (/[?&]desktop=1/.test(location.search)) {
      const ping = () => fetch('__alive', { cache: 'no-store' }).catch(() => {});
      ping(); setInterval(ping, 5000);
      window.addEventListener('pagehide', () => { if (navigator.sendBeacon) navigator.sendBeacon('__bye'); });
    }
    // installable web app (Android "Install app"): offline copy of the interface; not used by the desktop exe
    if ('serviceWorker' in navigator && window.isSecureContext && !/[?&]desktop=1/.test(location.search)) navigator.serviceWorker.register('sw.js').catch(() => {});
    A.applyTheme(S.theme);
    A.buildChrome();              // menus, toolbars, browser, right dock (panels.js)
    initStatusBar();
    initMap();
    initSplitters();
    initKeys();
    renderTree();
    A.renderRight();
    A.buildTimeline();
    renderDecoTitle();
    if (window.innerWidth <= 900) { document.getElementById('main').classList.add('no-right'); }
    if (AERIS.mobile) AERIS.mobile.init();       // phone layout below 760 px
    await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 60); });
    S.map.invalidateSize();
    A.zoomTo('priority');
    if (AERIS.tutorial) AERIS.tutorial.maybeAutoStart();   // first start: guided tour while the weather data loads
    await A.actions.startup();
  };

  Object.assign(A, { renderDecoTitle, syncLayer, clearMeasure, cancelPick, updateScale, WIND, PBL, ARR, AGE });
})();

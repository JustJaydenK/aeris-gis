/* AERIS-GIS — chrome (menus, toolbars, docks), processing dialogs, ground station, attribute table, exports */
(function () {
  'use strict';
  const U = AERIS.U, D = AERIS.data, MET = AERIS.met, MODEL = AERIS.model, CS = AERIS.cansat, ML = AERIS.maplayers, UI = AERIS.ui;
  const A = AERIS.app, S = A.S, X = A.actions, el = U.el, TR = AERIS.terrain, TT = AERIS.tutorial;
  S.emisOverride = U.lsGet('aeris.emis', {});
  /* tick one terrain layer (loads the DEM for the current view the first time) */
  function showDem(id) { A.LAYERS['g-terrain'].visible = true; A.setVisible(id, true); A.syncLayer(id); }
  S.rightTab = 'forecast';

  /* ============================== sources ============================== */
  function srcFromVolcano(v, species) {
    const o = (S.emisOverride[v.id] || {});
    return { id: v.id, name: v.name, lat: v.lat, lon: v.lon, ventMSL: v.elev, rise: o.rise !== undefined ? o.rise : v.rise,
      rate: o[species] !== undefined ? o[species] : v.emis[species] };
  }
  /* met period window; default start = now if inside the period, else the first PHT midnight of the period */
  function metWindow() {
    const [a, b] = MET.timeRange();
    const now = Math.floor(Date.now() / 3600e3) * 3600e3;
    let start;
    if (now >= a && now <= b - 6 * 3600e3) start = now;
    else if (MET.period) start = U.clamp(Date.parse(MET.period.start + 'T00:00:00Z') - 8 * 3600e3, a, b - 6 * 3600e3);
    else start = U.clamp(now, a, b - 6 * 3600e3);
    return { a, b, start };
  }
  const autoOut = (h) => (h <= 48 ? 1 : h <= 120 ? 3 : 6);
  function defaultParams(ids, species, hours) {
    const w = metWindow();
    const h = Math.max(1, Math.min(hours || 24, Math.floor((w.b - w.start) / 3600e3)));
    return {
      species, sources: ids.map((id) => srcFromVolcano(D.volcanoById(id), species)),
      startMs: w.start, hours: h, releaseHours: h, nPart: h > 48 ? 10000 : 6000, dtMin: h > 120 ? 15 : 10, layerTop: 100, res: 0, outHours: autoOut(h),
      dry: true, wet: true, chem: true, turbulence: 'auto', seed: 20260926,
      profilePoints: [{ name: 'CanSat site', lat: S.cfg.site.lat, lon: S.cfg.site.lon }]
    };
  }

  /* ============================== chrome ============================== */
  A.buildChrome = function () {
    buildMenus();
    buildToolbars();
    buildBrowser();
    buildLayerTools();
    buildRightTabs();
    A.algorithms = [
      { group: 'AERIS — Volcanic gas dispersion', name: 'HYSPLIT-style dispersion (Lagrangian particles)', icon: 'plume', run: () => X.dispersionDialog() },
      { group: 'AERIS — Volcanic gas dispersion', name: 'Forward trajectories (HYSPLIT)', icon: 'traj', run: () => X.trajDialog() },
      { group: 'AERIS — Volcanic gas dispersion', name: 'Backward trajectories — CanSat source attribution', icon: 'backtraj', run: () => X.backTrajDialog() },
      { group: 'AERIS — Volcanic gas dispersion', name: 'Receptor exposure report', icon: 'table', run: () => X.attributeTable('receptors') },
      { group: 'AERIS — CanSat mission', name: 'Deploy CanSat — 3D simulation', icon: 'cansat', run: () => AERIS.scene3d.open({ deploy: true }) },
      { group: 'AERIS — CanSat mission', name: 'Deploy CanSat on the map (2D)', icon: 'cansat', run: () => X.deploy() },
      { group: 'AERIS — CanSat mission', name: 'CanSat descent & telemetry simulation', icon: 'cansat', run: () => X.cansatDialog() },
      { group: 'AERIS — CanSat mission', name: 'Ground station (profiles, telemetry, go/no-go)', icon: 'cansat', run: () => X.groundStation() },
      { group: 'AERIS — CanSat mission', name: 'Six-flight field campaign', icon: 'campaign', run: () => X.campaignRun() },
      { group: 'AERIS — CanSat mission', name: 'Parachute sizing calculator', icon: 'cansat', run: () => X.parachuteCalc() },
      { group: 'Meteorology', name: 'Change forecast period / dates', icon: 'clock', run: () => X.periodDialog() },
      { group: 'Meteorology', name: 'Reload NWP from Open-Meteo', icon: 'refresh', run: () => X.reloadMet() },
      { group: 'Export', name: 'Figures & report (print layout)', icon: 'save', run: () => AERIS.figures.open() },
      { group: 'Meteorology', name: 'Met grids & model information', icon: 'lMesh', run: () => X.projectProperties() },
      { group: 'Export', name: 'HYSPLIT CONTROL + SETUP.CFG', icon: 'save', run: () => X.exportHysplit() },
      { group: 'Export', name: 'Export all layers to one GeoJSON (for QGIS)', icon: 'save', run: () => X.exportAll() },
      { group: 'Terrain analysis (DEM)', name: 'Load DEM — Copernicus GLO-30 / GLO-90, NASADEM, Terrain Tiles', icon: 'terrain', run: () => TR.dialog() },
      { group: 'Terrain analysis (DEM)', name: 'Elevation heat map (colour relief)', icon: 'terrain', run: () => showDem('dem-relief') },
      { group: 'Terrain analysis (DEM)', name: 'Hillshade', icon: 'terrain', run: () => showDem('dem-hill') },
      { group: 'Terrain analysis (DEM)', name: 'Slope', icon: 'terrain', run: () => showDem('dem-slope') },
      { group: 'Terrain analysis (DEM)', name: 'Aspect', icon: 'terrain', run: () => showDem('dem-aspect') },
      { group: 'Terrain analysis (DEM)', name: 'Contour lines', icon: 'terrain', run: () => showDem('dem-contours') },
      { group: 'Terrain analysis (DEM)', name: 'Contour polygons (elevation bands)', icon: 'terrain', run: () => showDem('dem-bands') },
      { group: 'Terrain analysis (DEM)', name: 'Elevation profile & LoRa line of sight', icon: 'profile', run: () => A.setTool('profile') },
      { group: 'Terrain analysis (DEM)', name: 'Profile: ground station → CanSat launch site', icon: 'profile', run: () => TR.profileBetween(S.cfg.gs, S.cfg.site, 'Ground station → CanSat launch site') },
      { group: 'Terrain analysis (DEM)', name: 'Raster layer statistics & hypsometry', icon: 'table', run: () => TR.statsWindow() },
      { group: 'Terrain analysis (DEM)', name: 'Export DEM as ESRI ASCII grid (QGIS)', icon: 'save', run: () => TR.exportASC() },
      { group: 'Terrain analysis (DEM)', name: 'Export contour lines / polygons as GeoJSON', icon: 'save', run: (e) => UI.contextMenu(innerWidth / 2 - 140, innerHeight / 3, TR.exportItems()) }
    ];
  };

  function buildMenus() {
    const has = () => !!A.activeResult();
    const models = Object.entries(MET.MODELS).map(([k, label]) => ({ label, checked: () => MET.model === k && (k === 'climatology') === (MET.source === 'climatology'), action: () => X.reloadMet(k) }));
    const species = Object.values(D.species).map((s) => ({ label: `${s.label} — ${s.name}`, checked: () => (S.activeSpecies || S.species) === s.id, action: () => X.setSpecies(s.id) }));
    UI.menubar(document.getElementById('menubar'), A.menus = [   // A.menus: also listed in the phone layout's More tab
      { label: 'Project', items: [
        { label: 'Forecast Period & Dates…', icon: 'clock', action: () => X.periodDialog() },
        { label: 'Reload Meteorology (Open-Meteo)', icon: 'refresh', action: () => X.reloadMet() },
        { label: 'New Print Layout — Figures & Report…', icon: 'save', action: () => AERIS.figures.open() },
        '-',
        { label: 'Export', icon: 'save', submenu: [
          { label: 'Concentration contours (current hour) → GeoJSON', action: () => X.exportContours(false), disabled: () => !has() },
          { label: 'Maximum-concentration contours → GeoJSON', action: () => X.exportContours(true), disabled: () => !has() },
          { label: 'Particles (current hour) → GeoJSON', action: () => X.exportParticles(), disabled: () => !has() },
          { label: 'Trajectories → GeoJSON', action: () => X.exportTraj(), disabled: () => !S.traj && !S.back },
          { label: 'CanSat track, landing ellipse, exclusion zone → GeoJSON', action: () => X.exportCansatGeo(), disabled: () => !S.cs },
          { label: 'Volcanoes & receptors → GeoJSON', action: () => X.exportPoints() },
          { label: 'Everything → one GeoJSON (QGIS)', action: () => X.exportAll() },
          '-',
          { label: 'CanSat ground-station log → CSV', action: () => X.exportCSV('ground'), disabled: () => !S.cs },
          { label: 'CanSat microSD log → CSV', action: () => X.exportCSV('sd'), disabled: () => !S.cs },
          { label: 'Receptor time series → CSV', action: () => X.exportCSV('receptors'), disabled: () => !has() },
          '-',
          ...TR.exportItems(),
          '-',
          { label: 'HYSPLIT CONTROL + SETUP.CFG…', action: () => X.exportHysplit() }
        ] },
        '-',
        { label: 'Properties…', icon: 'settings', action: () => X.projectProperties() }
      ] },
      { label: 'Edit', items: [
        { label: 'Clear Measurements', icon: 'measure', action: () => A.clearMeasure() },
        { label: 'Clear Identify Results', icon: 'identify', action: () => A.clearIdentify() },
        '-',
        { label: 'Remove All Model Output', action: () => X.clearOutputs() },
        { label: 'Remove Terrain DEM', icon: 'terrain', action: () => TR.clear(), disabled: () => !TR.dem }
      ] },
      { label: 'View', items: [
        { label: 'Panels', submenu: [
          { label: 'Layers / Browser', checked: () => !document.getElementById('main').classList.contains('no-left'), action: () => A.togglePanel('left') },
          { label: 'Plume Forecast / Toolbox', checked: () => !document.getElementById('main').classList.contains('no-right'), action: () => A.togglePanel('right') },
          { label: 'Temporal Controller', checked: () => !document.getElementById('temporalDock').classList.contains('hidden'), action: () => A.togglePanel('temporal') },
          { label: 'Log Messages', action: () => X.logWindow() }
        ] },
        '-',
        { label: 'Zoom to Philippines', icon: 'zoomFull', action: () => A.zoomTo('ph') },
        { label: 'Zoom to Priority Volcanoes (Davao)', icon: 'zoomVolcano', action: () => A.zoomTo('priority') },
        { label: 'Zoom to Mt. Apo', action: () => A.zoomTo('apo') },
        { label: 'Zoom to Mt. Leonard Kniaseff', action: () => A.zoomTo('leonard') },
        { label: 'Zoom to CanSat Site', icon: 'cansat', action: () => A.zoomTo('site') },
        '-',
        { label: '3D CanSat Deployment…', icon: 'cansat', action: () => AERIS.scene3d.open() },
        '-',
        { label: 'Decorations', submenu: [
          { label: 'Title Label', checked: () => S.deco.title, action: () => A.toggleDeco('title') },
          { label: 'North Arrow', checked: () => S.deco.north, action: () => A.toggleDeco('north') },
          { label: 'Scale Bar', checked: () => S.deco.scale, action: () => A.toggleDeco('scale') },
          { label: 'Legend', checked: () => S.deco.legend, action: () => A.toggleDeco('legend') },
          { label: 'Grid (graticule)', checked: () => S.deco.grid, action: () => A.toggleDeco('grid') }
        ] },
        { label: 'Temporal', submenu: [
          { label: 'Play / Pause', shortcut: 'Space', action: () => A.togglePlay() },
          { label: 'First Frame', action: () => A.setFrame(0) },
          { label: 'Last Frame', action: () => A.setFrame(S.timeline.length - 1) }
        ] }
      ] },
      { label: 'Layer', items: [
        { label: 'Add XYZ Layer', icon: 'lXYZ', submenu: () => ML.basemaps.map((b) => ({ label: b.name, checked: () => A.LAYERS['bm-' + b.id].visible, action: () => A.setVisible('bm-' + b.id, true) })) },
        { label: 'Open Attribute Table', icon: 'table', shortcut: 'F6', action: () => X.attributeTable() },
        { label: 'Layer Styling Panel', icon: 'brush', shortcut: 'F7', action: () => A.showRight('styling') },
        '-',
        { label: 'Pollutant', submenu: species }
      ] },
      { label: 'Settings', items: [
        { label: 'Options…', icon: 'settings', action: () => X.settings() },
        { label: 'Night Mapping Theme', checked: () => S.theme === 'night', action: () => A.applyTheme(S.theme === 'night' ? 'default' : 'night') },
        { label: 'Meteorological Model', icon: 'wind', submenu: models },
        '-',
        { label: 'Clear Cached Meteorology', action: async () => { await U.idb.clear(); UI.message('Cache', 'Cached met grids cleared.', 'ok', 4000); } }
      ] },
      { label: 'Plugins', items: [
        { label: 'AERIS Plume Forecast', icon: 'plume', action: () => A.showRight('forecast') },
        { label: 'AERIS CanSat Ground Station', icon: 'cansat', action: () => X.groundStation() }
      ] },
      { label: 'Vector', items: [
        { label: 'Measure Line', icon: 'measure', action: () => A.setTool('measure') },
        { label: 'Receptor Exposure Table', icon: 'table', action: () => X.attributeTable('receptors') },
        { label: 'Source Attribution (Backward Trajectories)', icon: 'backtraj', action: () => X.backTrajDialog() }
      ] },
      { label: 'Raster', items: [
        { label: 'Maximum Concentration (whole run)', checked: () => A.LAYERS.maxconc.visible, action: () => A.setVisible('maxconc', !A.LAYERS.maxconc.visible) },
        { label: 'Plume Arrival Time', checked: () => A.LAYERS.arrival.visible, action: () => A.setVisible('arrival', !A.LAYERS.arrival.visible) },
        { label: 'Boundary-Layer Height', checked: () => A.LAYERS.pbl.visible, action: () => A.setVisible('pbl', !A.LAYERS.pbl.visible) },
        '-',
        { label: 'Terrain (DEM) — Load & Style…', icon: 'terrain', action: () => TR.dialog() },
        { label: 'Terrain Layers', icon: 'terrain', submenu: () => [['dem-relief', 'Elevation Heat Map'], ['dem-hill', 'Hillshade'], ['dem-contours', 'Contour Lines'], ['dem-bands', 'Contour Polygons'], ['dem-slope', 'Slope'], ['dem-aspect', 'Aspect']]
          .map(([id, label]) => ({ label, checked: () => A.LAYERS[id].visible, action: () => (A.LAYERS[id].visible ? A.setVisible(id, false) : showDem(id)) })) },
        { label: 'Elevation Profile Tool', icon: 'profile', action: () => A.setTool('profile') },
        { label: 'Raster Layer Statistics…', icon: 'table', action: () => TR.statsWindow(), disabled: () => !TR.dem }
      ] },
      { label: 'Processing', items: [
        { label: 'Toolbox', icon: 'toolbox', shortcut: 'Ctrl+Alt+T', action: () => A.showRight('toolbox') },
        '-',
        { label: 'HYSPLIT-style Dispersion…', icon: 'plume', action: () => X.dispersionDialog() },
        { label: 'Forward Trajectories…', icon: 'traj', action: () => X.trajDialog() },
        { label: 'Backward Trajectories (CanSat site)…', icon: 'backtraj', action: () => X.backTrajDialog() },
        { label: 'Deploy CanSat — 3D Simulation', icon: 'cansat', action: () => AERIS.scene3d.open({ deploy: true }) },
        { label: 'Deploy CanSat on the Map (2D)', action: () => X.deploy() },
        { label: 'CanSat Descent Simulation…', icon: 'cansat', action: () => X.cansatDialog() },
        { label: 'Six-flight Campaign', icon: 'campaign', action: () => X.campaignRun() },
        { label: 'Parachute Sizing…', action: () => X.parachuteCalc() },
        '-',
        { label: 'History / Log', icon: 'log', action: () => X.logWindow() }
      ] },
      { label: 'Help', items: [
        { label: 'Interactive Tutorial', icon: 'tutorial', shortcut: 'Shift+F1', action: () => TT.start(0) },
        { label: 'Developer Tools', icon: 'settings', shortcut: 'Ctrl+Shift+D', action: () => AERIS.dev.open(), disabled: () => !AERIS.dev.enabled() },
        { label: 'Show Tutorial at Startup', checked: () => TT.isAuto(), action: () => TT.setAuto(!TT.isAuto()) },
        '-',
        { label: 'Methodology & Model Factors', icon: 'help', shortcut: 'F1', action: () => X.help() },
        { label: 'Keyboard Shortcuts', action: () => X.shortcuts() },
        '-',
        { label: 'About AERIS-GIS', action: () => X.about() }
      ] }
    ], `<img class="mb-logo" src="icons/favicon-32.png" alt=""><b>AERIS-GIS</b><span>Project AERIS · DCNHS</span>`);
  }

  function buildToolbars() {
    const tb = document.getElementById('toolbars');
    const grp = (...items) => { const g = el('div', { class: 'tb-group' }); items.forEach((i) => g.appendChild(i)); tb.appendChild(g); return g; };
    const tour = (g, name) => { g.dataset.tour = name; return g; };   // anchors for the interactive tutorial
    const btn = (ico, title, fn, tool) => el('button', { class: 'tbtn' + (tool === 'pan' ? ' active' : ''), title, 'data-tool': tool, html: UI.icon(ico), onclick: fn });
    grp(btn('layers', 'Toggle Layers panel', () => A.togglePanel('left')),
      btn('save', 'Export… (GeoJSON / CSV / HYSPLIT CONTROL)', (e) => { const r = e.currentTarget.getBoundingClientRect(); UI.contextMenu(r.left, r.bottom, [
        { label: 'Everything → one GeoJSON (QGIS)', action: () => X.exportAll() },
        { label: 'Concentration contours → GeoJSON', action: () => X.exportContours(false), disabled: () => !A.activeResult() },
        { label: 'CanSat microSD log → CSV', action: () => X.exportCSV('sd'), disabled: () => !S.cs },
        { label: 'HYSPLIT CONTROL + SETUP.CFG…', action: () => X.exportHysplit() }]); }),
      btn('refresh', 'Reload meteorology from Open-Meteo', () => X.reloadMet()));
    tour(grp(btn('pan', 'Pan Map', () => A.setTool('pan'), 'pan'),
      btn('zoomIn', 'Zoom In', () => S.map.zoomIn()),
      btn('zoomOut', 'Zoom Out', () => S.map.zoomOut()),
      btn('zoomFull', 'Zoom Full (Philippines)', () => A.zoomTo('ph')),
      btn('zoomVolcano', 'Zoom to Mt. Apo & Mt. Leonard Kniaseff', () => A.zoomTo('priority')),
      btn('zoomLayer', 'Zoom to Selected Layer', () => A.zoomToLayer(A.selectedLayer()))), 'nav');
    tour(grp(btn('identify', 'Identify Features', () => A.setTool('identify'), 'identify'),
      btn('measure', 'Measure Line', () => A.setTool('measure'), 'measure'),
      btn('table', 'Open Attribute Table (F6)', () => X.attributeTable())), 'inspect');
    const run = el('button', { class: 'tb-run', title: 'Run HYSPLIT-style dispersion…', html: UI.icon('plume') + '<span>Run Dispersion</span>', onclick: () => X.dispersionDialog() });
    tour(grp(run,
      btn('traj', 'Forward trajectories', () => X.trajDialog()),
      btn('backtraj', 'Backward trajectories from the CanSat site', () => X.backTrajDialog()),
      btn('cansat', 'CanSat descent simulation', () => X.cansatDialog()),
      btn('campaign', 'Six-flight campaign', () => X.campaignRun()),
      btn('toolbox', 'Processing Toolbox (Ctrl+Alt+T)', () => A.showRight('toolbox'))), 'model');
    tour(grp(el('button', { class: 'tb-run', title: 'Terrain: load a DEM (Copernicus, NASADEM) and draw the elevation heat map, hillshade, contour lines and contour polygons', html: UI.icon('terrain') + '<span>Terrain</span>', onclick: () => TR.dialog() }),
      btn('profile', 'Elevation profile and LoRa line of sight: click points, double-click to finish', () => A.setTool('profile'), 'profile')), 'terrain');
    tour(grp(el('button', { class: 'tb-run', title: 'Deploy the CanSat in 3D: see where it will go and in what direction', html: UI.icon('cansat') + '<span>Deploy 3D</span>', onclick: () => AERIS.scene3d.open({ deploy: true }) }),
      el('button', { class: 'tb-run', title: 'Print layout — numbered figures for every result (PNG / ZIP / PDF)', html: UI.icon('save') + '<span>Figures</span>', onclick: () => AERIS.figures.open() })), 'deploy');
    tour(grp(btn('clock', 'Temporal Controller', () => A.togglePanel('temporal')),
      el('button', { class: 'tb-run', id: 'tbPeriod', title: 'Forecast period — change the dates', html: '<span>📅</span><span id="tbPeriodLbl">Latest forecast</span>', onclick: () => X.periodDialog() })), 'time');
    const spSel = el('select', { class: 'tb-select', id: 'tbSpecies', title: 'Pollutant' });
    Object.values(D.species).forEach((s) => spSel.appendChild(el('option', { value: s.id, text: s.label })));
    spSel.addEventListener('change', () => X.setSpecies(spSel.value));
    grp(el('span', { class: 'tb-label', text: 'Pollutant' }), spSel);
    const mSel = el('select', { class: 'tb-select', id: 'tbModel', title: 'Numerical weather prediction model (Open-Meteo)' });
    Object.entries(MET.MODELS).forEach(([k, v]) => mSel.appendChild(el('option', { value: k, text: v.split(' (')[0] })));
    mSel.value = MET.model;
    mSel.addEventListener('change', () => X.reloadMet(mSel.value));
    grp(el('span', { class: 'tb-label', text: 'NWP' }), mSel);
    const help = tour(grp(el('button', { class: 'tb-run', title: 'Interactive tutorial: a guided tour of AERIS-GIS (Shift+F1)', html: UI.icon('tutorial') + '<span>Tutorial</span>', onclick: () => TT.start(0) })), 'tutorial');
    help.classList.add('tb-right');
  }

  function buildBrowser() {
    const root = document.getElementById('browserTree');
    const node = (ico, name, kids, onclick) => {
      const li = el('li');
      const row = el('div', { class: 'row' }, [el('span', { class: 'tw' + (kids ? '' : ' leaf'), text: '▶' }), el('span', { class: 'lico', html: UI.icon(ico) }), el('span', { class: 'lname', text: name })]);
      li.appendChild(row);
      let ul = null;
      if (kids) {
        ul = el('ul', { class: 'hidden' });
        kids.forEach((k) => ul.appendChild(k));
        li.appendChild(ul);
      }
      row.addEventListener('click', () => {
        if (ul) { ul.classList.toggle('hidden'); row.querySelector('.tw').textContent = ul.classList.contains('hidden') ? '▶' : '▼'; }
        onclick && onclick();
      });
      return li;
    };
    root.append(
      node('open', 'Project Home — AERIS', null, () => A.zoomTo('priority')),
      node('lXYZ', 'XYZ Tiles', ML.basemaps.map((b) => node('lXYZ', b.name, null, () => A.setVisible('bm-' + b.id, true)))),
      node('wind', 'Open-Meteo NWP', [
        node('lMesh', 'Mindanao nest 0.25°', null, () => { A.setVisible('metgrid', true); S.map.fitBounds([[5.5, 124], [9, 127.5]]); }),
        node('lMesh', 'Philippines parent 1.0°', null, () => { A.setVisible('metgrid', true); A.zoomTo('ph'); })
      ]),
      node('lVolc', 'PHIVOLCS Volcanoes', D.volcanoes.slice().sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0)).map((v) => node('lVolc', v.name, null, () => S.map.setView([v.lat, v.lon], 11)))),
      node('terrain', 'Elevation (DEM)', Object.entries(TR.SOURCES).map(([k, s]) => node('lRaster', s.name, null, () => TR.load({ source: k, area: 'view' })))),
      node('cansat', 'CanSat Field Site', null, () => A.zoomTo('site'))
    );
  }

  function buildLayerTools() {
    const t = document.getElementById('layerTools');
    const b = (ico, title, fn) => el('button', { class: 'tbtn', title, html: UI.icon(ico), onclick: fn });
    t.append(
      b('brush', 'Open the Layer Styling panel', () => A.showRight('styling')),
      b('expand', 'Expand all', () => { Object.values(A.LAYERS).forEach((n) => { if (n.children || n.legend) n.expanded = true; }); A.renderTree(); }),
      b('collapse', 'Collapse all', () => { Object.values(A.LAYERS).forEach((n) => (n.expanded = false)); A.renderTree(); }),
      b('zoomLayer', 'Zoom to selected layer', () => A.zoomToLayer(A.selectedLayer())),
      b('table', 'Open attribute table', () => X.attributeTable())
    );
  }

  /* ============================== right dock ============================== */
  const RIGHT_TABS = [['forecast', 'Plume Forecast', 'AERIS Plume Forecast'], ['toolbox', 'Processing', 'Processing Toolbox'], ['identify', 'Identify', 'Identify Results'], ['styling', 'Styling', 'Layer Styling']];
  function buildRightTabs() {
    const bar = document.getElementById('rightTabs');
    RIGHT_TABS.forEach(([id, label]) => bar.appendChild(el('div', { class: 'dtab', 'data-id': id, text: label, onclick: () => A.showRight(id) })));
  }
  A.showRight = function (tab) {
    S.rightTab = tab;
    const main = document.getElementById('main');
    if (main.classList.contains('no-right')) { main.classList.remove('no-right'); setTimeout(() => S.map.invalidateSize(), 50); }
    A.renderRight();
  };
  A.renderRight = function () {
    document.querySelectorAll('#rightTabs .dtab').forEach((t) => t.classList.toggle('active', t.dataset.id === S.rightTab));
    document.getElementById('rightTitle').textContent = RIGHT_TABS.find((t) => t[0] === S.rightTab)[2];
    const body = document.getElementById('rightBody');
    body.innerHTML = '';
    if (S.rightTab === 'forecast') renderForecastFull(body);
    if (S.rightTab === 'toolbox') renderToolbox(body);
    if (S.rightTab === 'identify') renderIdentify(body);
    if (S.rightTab === 'styling') A.renderStyling(body);
  };

  /* ---------- Plume Forecast (priority volcanoes) ---------- */
  function ventState(v, t) {
    const src = srcFromVolcano(v, 'SO2');
    const zPlume = v.elev + src.rise * 0.5;
    const s = {};
    MET.sample(v.lat, v.lon, zPlume, t, s);
    if (!s.valid) return null;
    const [ws, wd] = U.uvToWsWd(s.u, s.v);
    const cls = MODEL.stabilityClass(t, v.lon, s.cloud, s.ws10);
    const mixTop = s.terrain + s.pblh;
    return { ws, wd, heading: (wd + 180) % 360, pblh: s.pblh, cls, terrain: s.terrain, top: v.elev + src.rise, mixTop, lofted: v.elev + src.rise * 0.5 > mixTop };
  }
  const arrowSVG = (deg, color) => `<svg viewBox="0 0 24 24"><g transform="rotate(${deg.toFixed(0)} 12 12)"><path d="M12 2.5l5.5 9h-3.4v10h-4.2v-10H6.5z" fill="${color}"/></g></svg>`;
  function renderForecastFull(body) {
    if (!MET.ready) { body.appendChild(el('div', { class: 'pad muted', text: 'Loading meteorology…' })); return; }
    const t = A.currentTime();
    const R = A.activeResult();
    const head = el('div', { class: 'card' }, [
      el('div', { class: 'ch', html: `${UI.icon('wind', 'width="16" height="16"')}<b>Meteorology</b>` }),
      el('div', { class: 'cb', html: `<div class="muted" style="font-size:11px">${U.esc(MET.describe())}</div>
        <div style="margin-top:4px">Map time: <b data-live="time">${U.fmtPHT(t, true)}</b></div>` }),
    ]);
    const acts = el('div', { class: 'acts', style: { padding: '0 8px 8px' } }, [
      el('button', { class: 'btn small primary', text: 'Run 24 h — both priority volcanoes', onclick: () => X.runQuick(['apo', 'leonard'], { species: S.species }) }),
      el('button', { class: 'btn small', text: 'Dispersion…', onclick: () => X.dispersionDialog() })
    ]);
    head.appendChild(acts);
    body.appendChild(head);
    ['leonard', 'apo'].forEach((id) => body.appendChild(volcanoCard(D.volcanoById(id), t, R)));
    body.appendChild(cansatCard());
    if (R) {
      const s = D.species[R.species];
      const top = R.receptors.filter((r) => r.max >= s.classes[0]).sort((a, b) => b.max - a.max).slice(0, 8);
      const c = el('div', { class: 'card' }, [el('div', { class: 'ch', html: `${UI.icon('table', 'width="16" height="16"')}<b>Most affected towns — ${s.label} (run max)</b>` })]);
      const cb = el('div', { class: 'cb' });
      cb.innerHTML = top.length ? `<ul class="impact">${top.map((r) => `<li><span>${U.esc(r.name)} <span class="muted">+${r.arrival || '?'} h</span></span><span>${A.fmtConc(R.species, r.max)}</span></li>`).join('')}</ul>`
        : `<div class="muted">No town exceeds ${A.fmtConc(R.species, s.classes[0])} in this run.</div>`;
      cb.appendChild(el('div', { class: 'acts' }, [el('button', { class: 'btn small', text: 'Receptor table', onclick: () => X.attributeTable('receptors') })]));
      c.appendChild(cb);
      body.appendChild(c);
    }
  }
  function volcanoCard(v, t, R) {
    const st = ventState(v, t);
    const card = el('div', { class: 'card', 'data-volc': v.id });
    card.appendChild(el('div', { class: 'ch', html: `${UI.icon('lVolc', 'width="16" height="16"')}<b>${U.esc(v.name)}</b><span class="tag ${v.status === 'Active' ? '' : 'pa'}">${U.esc(v.status)}</span>` }));
    const cb = el('div', { class: 'cb' });
    const src = srcFromVolcano(v, S.species);
    cb.innerHTML = `<dl class="kv">
      <dt>Vent</dt><dd>${U.fmtNum(v.elev)} m · ${U.fmtLL(v.lat, v.lon, 3)}</dd>
      <dt>Scenario</dt><dd>${D.species[S.species].label} ${src.rate} t/d · plume rise ${src.rise} m</dd>
      <dt>Wind @ plume</dt><dd data-live="wind">${st ? `${st.ws.toFixed(1)} m/s from ${st.wd.toFixed(0)}° (${U.compass(st.wd)})` : '—'}</dd>
      <dt>Plume heading</dt><dd data-live="head"><b>${st ? `→ ${U.compass(st.heading)} (${st.heading.toFixed(0)}°)` : '—'}</b></dd>
      <dt>Mixed layer</dt><dd data-live="pbl">${st ? `${U.fmtNum(st.pblh)} m AGL · Pasquill ${st.cls}` : '—'}</dd>
      <dt>Plume vs mixing</dt><dd data-live="loft">${st ? (st.lofted ? 'lofted above mixed layer (little ground impact now)' : 'inside mixed layer → mixes to ground') : '—'}</dd></dl>`;
    // 24-h heading strip
    const strip = el('div', { class: 'heading-strip' });
    for (let k = 0; k < 8; k++) {
      const tk = t + k * 3 * 3600e3;
      const s2 = ventState(v, tk);
      strip.appendChild(el('div', { html: s2 ? `${arrowSVG(s2.heading, s2.ws > 6 ? '#c62828' : s2.ws > 3 ? '#1f4fd6' : '#607d8b')}${U.fmtPHT(tk).slice(0, 5)}<br>${s2.ws.toFixed(1)}` : '—' }));
    }
    cb.appendChild(el('div', { class: 'muted', style: { fontSize: '10.5px', marginTop: '6px' }, text: 'Plume heading, next 24 h (every 3 h, PHT · m/s)' }));
    cb.appendChild(strip);
    if (R && R.sources.some((s) => s.id === v.id)) {
      const s = D.species[R.species];
      const near = R.receptors.filter((r) => U.haversine(r.lat, r.lon, v.lat, v.lon) < 120000 && r.max >= s.classes[0]).sort((a, b) => b.max - a.max).slice(0, 4);
      cb.appendChild(el('div', { html: near.length ? `<div class="muted" style="font-size:10.5px;margin-top:6px">Towns within 120 km reached (run max, ${s.label})</div><ul class="impact">${near.map((r) => `<li><span>${U.esc(r.name)}</span><span>${A.fmtConc(R.species, r.max)}</span></li>`).join('')}</ul>`
        : `<div class="muted" style="font-size:11px;margin-top:6px">No town within 120 km above ${A.fmtConc(R.species, s.classes[0])} in the current run.</div>` }));
    }
    cb.appendChild(el('div', { class: 'acts' }, [
      el('button', { class: 'btn small', text: 'Run 24 h', onclick: () => X.runQuick([v.id], { species: S.species }) }),
      el('button', { class: 'btn small', text: 'Trajectories', onclick: () => X.runTrajectories([v.id]) }),
      el('button', { class: 'btn small', text: 'Zoom', onclick: () => A.zoomTo(v.id) })
    ]));
    card.appendChild(cb);
    return card;
  }
  function cansatCard() {
    const c = el('div', { class: 'card' }, [el('div', { class: 'ch', html: `${UI.icon('cansat', 'width="16" height="16"')}<b>CanSat — ${U.esc(D.site.name)}</b>` })]);
    const cb = el('div', { class: 'cb' });
    if (S.cs) {
      const st = S.cs.stats, g = S.gng;
      cb.innerHTML = `<dl class="kv">
        <dt>Flight</dt><dd>${U.fmtPHT(S.cfg.flightTime, true)} <span class="pill ${g.verdict === 'GO' ? 'go' : g.verdict === 'NO-GO' ? 'nogo' : 'caution'}">${g.verdict}</span></dd>
        <dt>Wind @ ${S.cfg.releaseAGL} m</dt><dd>${g.wsRel.toFixed(1)} m/s</dd>
        <dt>Descent</dt><dd>${st.descentRate.toFixed(2)} m/s · ${S.cs.descentTime.toFixed(0)} s · ${st.descentSamples} samples</dd>
        <dt>Landing</dt><dd>${S.cs.landing.dist.toFixed(0)} m ${U.compass(S.cs.landing.brg)} of launch · 95 % ellipse ${S.mc.a.toFixed(0)}×${S.mc.b.toFixed(0)} m</dd>
        <dt>LoRa PDR</dt><dd>${(st.pdr * 100).toFixed(1)} % · gaps > 3 s: ${st.gaps3s}</dd>
        <dt>Max SO₂ read</dt><dd>${st.maxSO2.toFixed(0)} ppb</dd></dl>`;
      if (S.attribution && S.attribution.length) {
        const a = S.attribution[0];
        cb.appendChild(el('div', { class: 'muted', style: { fontSize: '11px', marginTop: '4px' }, html: `Back-trajectory: air at ${a.height} m passed <b>${a.distKm.toFixed(1)} km</b> from ${U.esc(a.volcano)} ${a.hoursBefore.toFixed(0)} h earlier.` }));
      }
    } else cb.innerHTML = '<div class="muted">No simulation yet.</div>';
    cb.appendChild(el('div', { class: 'acts' }, [
      el('button', { class: 'btn small primary', text: '🚀 Deploy 3D', onclick: () => AERIS.scene3d.open({ deploy: true }) }),
      el('button', { class: 'btn small', text: 'Deploy on map', onclick: () => X.deploy() }),
      el('button', { class: 'btn small', text: 'Simulate…', onclick: () => X.cansatDialog() }),
      el('button', { class: 'btn small', text: 'Ground station', onclick: () => X.groundStation() }),
      el('button', { class: 'btn small', text: 'Zoom', onclick: () => A.zoomTo('site') })
    ]));
    c.appendChild(cb);
    return c;
  }
  A.renderForecast = function (light) {
    if (S.rightTab !== 'forecast') return;
    const body = document.getElementById('rightBody');
    if (!light || !body.querySelector('[data-volc]')) { A.renderRight(); return; }
    const t = A.currentTime();
    const tl = body.querySelector('[data-live="time"]');
    if (tl) tl.textContent = U.fmtPHT(t, true);
    body.querySelectorAll('[data-volc]').forEach((card) => {
      const st = ventState(D.volcanoById(card.dataset.volc), t);
      if (!st) return;
      const set = (k, h) => { const n = card.querySelector(`[data-live="${k}"]`); if (n) n.innerHTML = h; };
      set('wind', `${st.ws.toFixed(1)} m/s from ${st.wd.toFixed(0)}° (${U.compass(st.wd)})`);
      set('head', `<b>→ ${U.compass(st.heading)} (${st.heading.toFixed(0)}°)</b>`);
      set('pbl', `${U.fmtNum(st.pblh)} m AGL · Pasquill ${st.cls}`);
      set('loft', st.lofted ? 'lofted above mixed layer (little ground impact now)' : 'inside mixed layer → mixes to ground');
    });
  };

  /* ---------- Processing Toolbox ---------- */
  function renderToolbox(body) {
    const search = el('div', { class: 'search' }, [el('input', { placeholder: 'Search…', id: 'tbxSearch' })]);
    body.appendChild(search);
    const tree = el('ul', { class: 'tree' });
    body.appendChild(tree);
    const draw = (q) => {
      tree.innerHTML = '';
      const groups = {};
      A.algorithms.filter((a) => !q || a.name.toLowerCase().includes(q)).forEach((a) => (groups[a.group] = groups[a.group] || []).push(a));
      Object.entries(groups).forEach(([g, list]) => {
        const li = el('li');
        li.appendChild(el('div', { class: 'row' }, [el('span', { class: 'tw', text: '▼' }), el('span', { class: 'lico', html: UI.icon(g.startsWith('AERIS — C') ? 'cansat' : g.startsWith('AERIS') ? 'plume' : g === 'Export' ? 'save' : g.startsWith('Terrain') ? 'terrain' : 'wind') }), el('span', { class: 'lname group', text: g })]));
        const ul = el('ul');
        list.forEach((a) => {
          const r = el('div', { class: 'row algo', title: 'Double-click to open' }, [el('span', { class: 'tw leaf' }), el('span', { class: 'lico', html: UI.icon('toolbox') }), el('span', { class: 'lname', text: a.name })]);
          r.addEventListener('dblclick', a.run);
          r.addEventListener('click', (e) => { tree.querySelectorAll('.row.selected').forEach((n) => n.classList.remove('selected')); r.classList.add('selected'); if (e.detail === 1) setTimeout(() => {}, 0); });
          r.addEventListener('keydown', (e) => { if (e.key === 'Enter') a.run(); });
          ul.appendChild(el('li', {}, [r]));
        });
        li.appendChild(ul);
        tree.appendChild(li);
      });
    };
    draw('');
    search.querySelector('input').addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
    body.appendChild(el('div', { class: 'pad muted', style: { fontSize: '11px' }, html: 'Double-click an algorithm to open its dialog. All algorithms run locally in your browser; only weather and air-quality data are fetched (Open-Meteo, no API key).' }));
  }

  /* ---------- Identify results ---------- */
  function renderIdentify(body) {
    if (!S.identify) { body.appendChild(el('div', { class: 'pad muted', html: 'Select the <b>Identify</b> tool (toolbar) and click the map, or right-click → <i>Identify here</i>.' })); return; }
    const t = el('table', { class: 'identify-table' });
    S.identify.forEach(([k, v]) => {
      if (k === '__grp') t.appendChild(el('tr', { class: 'grp' }, [el('td', { colspan: 2, text: v })]));
      else t.appendChild(el('tr', {}, [el('td', { text: k }), el('td', { text: v })]));
    });
    body.appendChild(t);
  }

  /* ---------- Layer Styling ---------- */
  A.renderStyling = function (body) {
    body = body || (S.rightTab === 'styling' ? document.getElementById('rightBody') : null);
    if (!body) return;
    body.innerHTML = '';
    const selId = A.selectedLayer();
    if (selId === 'g-terrain' || selId.startsWith('dem-')) { TR.stylingPanel(body); return; }
    const st = S.style;
    const pad = el('div', { class: 'pad' });
    const row = (label, ctrl) => pad.appendChild(el('div', { class: 'style-row' }, [el('span', { text: label }), ctrl]));
    const sel = (opts, val, fn) => { const s = el('select'); opts.forEach(([v, l]) => { const o = el('option', { value: v, text: l }); if (String(v) === String(val)) o.selected = true; s.appendChild(o); }); s.addEventListener('change', () => fn(s.value)); return s; };
    const rng = (min, max, step, val, fn) => { const r = el('input', { type: 'range', min, max, step }); r.value = val; r.addEventListener('input', () => fn(+r.value)); return r; };
    const refresh = (full) => { AERIS.U.lsSet('aeris.style', st); if (full) A.renderStatic(); A.renderTime(); A.renderTree(); A.renderLegendDeco(); };
    pad.appendChild(el('div', { style: { fontWeight: 600, margin: '2px 0 6px' }, text: `Selected layer: ${A.LAYERS[A.selectedLayer()].name}` }));
    pad.appendChild(el('div', { class: 'muted', style: { fontWeight: 600, margin: '8px 0 2px' }, text: 'Concentration (singleband pseudocolor)' }));
    const avail = Object.keys(S.results);
    row('Pollutant', sel(Object.values(D.species).map((s) => [s.id, s.label + (avail.includes(s.id) ? '' : ' (not run)')]), S.activeSpecies || S.species, (v) => X.setSpecies(v)));
    row('Units', sel([['mix', 'ppb / ppm (mixing ratio)'], ['ug', 'µg/m³ (mass)']], st.units, (v) => { st.units = v; refresh(false); A.renderRight(); }));
    const rampSel = sel(Object.keys(D.ramps).map((k) => [k, k]), st.ramp, (v) => { st.ramp = v; refresh(true); A.renderStyling(); });
    row('Color ramp', el('div', {}, [rampSel, el('div', { class: 'ramp-prev', html: D.ramps[st.ramp].map((c) => `<span style="background:${c}"></span>`).join('') })]));
    row('Interpolation', sel([['1', 'Continuous (log)'], ['0', 'Discrete classes']], st.continuous ? '1' : '0', (v) => { st.continuous = v === '1'; refresh(true); }));
    row('Raster opacity', rng(0, 1, 0.05, st.rasterOpacity, (v) => { st.rasterOpacity = v; if (S.overlays.conc) S.overlays.conc.setOpacity(v); AERIS.U.lsSet('aeris.style', st); }));
    row('Contours', sel([['lines', 'Lines'], ['filled', 'Filled (HYSPLIT style)'], ['off', 'Off']], st.contour, (v) => { st.contour = v; refresh(false); }));
    pad.appendChild(el('div', { class: 'muted', style: { fontWeight: 600, margin: '10px 0 2px' }, text: 'Particles' }));
    row('Colour by', sel([['height', 'Height AGL'], ['age', 'Age since release'], ['source', 'Source volcano']], st.particleColor, (v) => { st.particleColor = v; refresh(false); }));
    row('Size (px)', rng(1, 4, 0.5, st.particleSize, (v) => { st.particleSize = v; S.lg.particles.redraw(); AERIS.U.lsSet('aeris.style', st); }));
    row('Opacity', rng(0.1, 1, 0.05, st.particleOpacity, (v) => { st.particleOpacity = v; S.lg.particles.setOpacity(v); AERIS.U.lsSet('aeris.style', st); }));
    pad.appendChild(el('div', { class: 'muted', style: { fontWeight: 600, margin: '10px 0 2px' }, text: 'Wind vectors' }));
    row('Level', sel(MET.LEVELS.map((l, i) => [i, l.label]), st.windLevel, (v) => { st.windLevel = +v; refresh(false); }));
    pad.appendChild(el('div', { class: 'muted', style: { fontWeight: 600, margin: '10px 0 2px' }, text: 'Decorations' }));
    ['title', 'north', 'scale', 'legend', 'grid'].forEach((k) => {
      const c = el('input', { type: 'checkbox' }); c.checked = S.deco[k];
      c.addEventListener('change', () => A.toggleDeco(k));
      pad.appendChild(el('label', { class: 'chk' }, [c, el('span', { text: { title: 'Title label', north: 'North arrow', scale: 'Scale bar', legend: 'Legend', grid: 'Grid / graticule' }[k] })]));
    });
    body.appendChild(pad);
  };

  /* ============================== actions ============================== */
  X.setSpecies = function (spId) {
    S.species = spId;
    const sel = document.getElementById('tbSpecies');
    if (sel) sel.value = spId;
    if (S.results[spId]) {
      S.activeSpecies = spId;
      A.buildTimeline(); A.renderStatic(); A.renderTime(); A.renderTree(); A.renderLegendDeco(); A.renderRight();
    } else {
      UI.message('No run yet', `No ${D.species[spId].label} dispersion has been computed.`, 'warn', 8000,
        { label: `Run ${D.species[spId].label} (24 h, priority volcanoes)`, run: () => X.runQuick(['apo', 'leonard'], { species: spId }) });
      A.renderRight();
    }
  };

  A.runDispersion = async function (p, ctx = {}) {
    const log = ctx.log || ((m) => UI.log(m, 'info', 'Processing'));
    const lbl = D.species[p.species].label;
    A.busy(`Running ${lbl} dispersion…`);
    UI.progress(0);
    try {
      const R = await MODEL.runDispersion(p, (f) => { UI.progress(f); ctx.progress && ctx.progress(f); A.busy(`${lbl} dispersion ${Math.round(f * 100)} %`); }, ctx.cancelled);
      R.log.forEach((l) => log(l));
      S.results[p.species] = R;
      S.activeSpecies = p.species; S.species = p.species;
      const sel = document.getElementById('tbSpecies'); if (sel) sel.value = p.species;
      S.ti = 0;
      A.buildTimeline(); A.renderStatic(); A.renderTime(); A.renderTree(); A.renderLegendDeco(); A.renderRight();
      const s = D.species[p.species];
      const hot = R.receptors.filter((r) => r.max >= s.classes[0]).sort((a, b) => b.max - a.max)[0];
      UI.message('Dispersion complete', `${lbl}, ${p.hours} h from ${U.fmtPHT(p.startMs, true)} · ${U.fmtNum(R.nParticles)} particles · peak 0–${p.layerTop} m: ${A.fmtConc(p.species, R.peak)}` +
        (hot ? ` · most affected town: <b>${U.esc(hot.name)}</b> (${A.fmtConc(p.species, hot.max)})` : ''), 'ok', 9000);
      UI.log(`Dispersion ${lbl}: ${R.sources.map((x) => x.name).join(', ')} · peak ${A.fmtConc(p.species, R.peak)}`, 'ok', 'Processing');
      return R;
    } finally { UI.progress(null); A.busy(null); }
  };

  X.runQuick = async function (ids, opts = {}) {
    if (!MET.ready) return;
    const p = defaultParams(ids, opts.species || S.species, opts.hours || 24);
    if (!p.sources.some((s) => s.rate > 0)) {
      UI.message('Zero emission', `The scenario rate for ${D.species[p.species].label} is 0 t/d for ${ids.map((i) => D.volcanoById(i).name).join(', ')}. Set a rate in the dispersion dialog.`, 'warn', 9000,
        { label: 'Open dialog', run: () => X.dispersionDialog({ sources: ids }) });
      return;
    }
    try { await A.runDispersion(p); } catch (e) { UI.message('Dispersion failed', U.esc(e.message), 'err', 0); }
  };

  /* ---------- HYSPLIT-style dispersion dialog ---------- */
  X.dispersionDialog = function (preset = {}) {
    if (!MET.ready) { UI.message('Meteorology', 'Meteorology is still loading.', 'warn'); return; }
    const w = metWindow();
    const R = A.activeResult();
    let species = preset.species || S.species;
    const chosen = new Set(preset.sources || (R ? R.sources.map((s) => s.id) : ['apo', 'leonard']));
    const vols = D.volcanoes.slice().sort((a, b) => (b.priority - a.priority) || ((b.emis.SO2 > 0) - (a.emis.SO2 > 0)));
    const rows = {};
    let tableHost;
    const drawTable = () => {
      tableHost.innerHTML = '';
      const t = el('table', { class: 'srcgrid' });
      t.appendChild(el('tr', {}, ['Use', 'Source', 'Vent (m)', `Rate (t/d)`, 'Rise (m)'].map((h) => el('th', { text: h }))));
      vols.forEach((v) => {
        const src = srcFromVolcano(v, species);
        const cb = el('input', { type: 'checkbox' }); cb.checked = chosen.has(v.id);
        const rate = el('input', { type: 'number', min: 0, step: 'any', value: src.rate });
        const rise = el('input', { type: 'number', min: 0, step: 10, value: src.rise });
        const tr = el('tr', { class: (v.priority ? 'pri' : '') + (src.rate > 0 ? '' : ' off') }, [el('td', {}, [cb]), el('td', { text: v.name }), el('td', { text: U.fmtNum(v.elev) }), el('td', {}, [rate]), el('td', {}, [rise])]);
        cb.addEventListener('change', () => { if (cb.checked) chosen.add(v.id); else chosen.delete(v.id); });
        rows[v.id] = { cb, rate, rise };
        t.appendChild(tr);
      });
      tableHost.appendChild(t);
    };
    const maxH = Math.floor((w.b - w.start) / 3600e3);
    const hoursOpts = [6, 12, 24, 36, 48, 72, 96, 120, 168, 240, 336].filter((h) => h <= maxH).map((h) => ({ value: h, label: h < 48 ? `${h} h` : `${h} h (${h / 24} days)` }));
    if (maxH > 6 && !hoursOpts.some((o) => o.value === maxH)) hoursOpts.push({ value: maxH, label: `${maxH} h — whole period from start` });
    const fields = [
      { type: 'select', key: 'species', label: 'Pollutant', value: species, options: Object.values(D.species).map((s) => ({ value: s.id, label: `${s.label} — ${s.name}` })),
        onchange: (v) => { species = v; drawTable(); } },
      { type: 'custom', render: () => { const f = el('div', { class: 'field' }, [el('label', { class: 'fl', html: 'Emission sources <span class="opt">(scenario rates — replace with PHIVOLCS flux values)</span>' })]); tableHost = el('div', { class: 'srcscroll' }); f.appendChild(tableHost); drawTable(); return f; } },
      { type: 'group', label: 'Run', fields: [
        { type: 'datetime', key: 'start', label: 'Release start (PHT, Philippine time)', value: U.toPHTInput(R && R.params.startMs >= w.a && R.params.startMs < w.b ? R.params.startMs : w.start), min: U.toPHTInput(w.a), max: U.toPHTInput(w.b - 3600e3),
          hint: `Period loaded: ${U.fmtPHT(w.a, true)} → ${U.fmtPHT(w.b, true)}. <a href="#" data-period>Change dates…</a>` },
        { type: 'select', key: 'hours', label: 'Total run time', value: R && hoursOpts.some((o) => o.value === R.params.hours) ? R.params.hours : Math.min(24, maxH), options: hoursOpts.length ? hoursOpts : [{ value: 6, label: '6 h' }] },
        { type: 'number', key: 'releaseHours', label: 'Hours of emission', value: R ? R.params.releaseHours : 24, min: 1, max: 336, step: 1, hint: 'Continuous passive degassing = the whole run (it is capped at the run time).' },
        { type: 'select', key: 'outHours', label: 'Output / averaging interval', value: 'auto', options: [{ value: 'auto', label: 'Auto (1 h up to 2 days, 3 h up to 5 days, 6 h beyond)' }, { value: 1, label: '1 h' }, { value: 3, label: '3 h' }, { value: 6, label: '6 h' }] },
        { type: 'number', key: 'nPart', label: 'Number of particles', value: R ? R.params.nPart : 6000, min: 1000, max: 40000, step: 500, hint: 'More particles give smoother fields; use 10,000+ for multi-day runs.' },
        { type: 'select', key: 'dtMin', label: 'Integration time step', value: 10, options: [5, 10, 15, 20].map((v) => ({ value: v, label: `${v} min` })) }
      ] },
      { type: 'group', label: 'Concentration grid', fields: [
        { type: 'number', key: 'layerTop', label: 'Averaging layer top (m AGL)', value: 100, min: 20, max: 2000, step: 10, hint: '100 m = the CanSat release altitude, so model and CanSat profile the same layer.' },
        { type: 'select', key: 'res', label: 'Grid resolution', value: 0, options: [{ value: 0, label: 'Auto (fit plume, ≤ 340 cells)' }, ...[0.01, 0.02, 0.05, 0.1].map((r) => ({ value: r, label: `${r}° (≈${(r * 111).toFixed(1)} km)` }))] }
      ] },
      { type: 'group', label: 'Physics', fields: [
        { type: 'select', key: 'turbulence', label: 'Turbulence / stability', value: 'auto', options: [{ value: 'auto', label: 'Auto — Pasquill class from sun, cloud, wind; PBL from GFS' }, { value: 'convective', label: 'Force convective (B)' }, { value: 'neutral', label: 'Force neutral (D)' }, { value: 'stable', label: 'Force stable (F)' }] },
        { type: 'checkbox', key: 'dry', label: 'Dry deposition (v<sub>d</sub> from pollutant table)', value: true },
        { type: 'checkbox', key: 'wet', label: 'Wet deposition (below-cloud scavenging from GFS precipitation)', value: true },
        { type: 'checkbox', key: 'chem', label: 'Chemical conversion (SO₂ → sulfate, H₂S oxidation; RH-dependent)', value: true },
        { type: 'number', key: 'seed', label: 'Random seed', value: 20260926, step: 1 }
      ] }
    ];
    setTimeout(() => { const a = document.querySelector('#windowLayer [data-period]'); if (a) a.addEventListener('click', (e) => { e.preventDefault(); X.periodDialog(); }); }, 0);
    UI.algorithmDialog({
      id: 'dlg-disp', title: 'HYSPLIT-style Dispersion (Lagrangian particles)', icon: 'plume', width: 860, height: 680,
      help: helpDispersion(), fields,
      logParams: (v) => ({ ...v, start: v.start + ' PHT', sources: collect().map((s) => `${s.name}: ${s.rate} t/d, vent ${s.ventMSL} m, rise ${s.rise} m`) }),
      run: async (v, ctx) => {
        const srcs = collect();
        if (!srcs.length) throw new Error('Tick at least one source.');
        const startMs = Math.floor(U.fromPHTInput(v.start) / 3600e3) * 3600e3;
        if (startMs < w.a || startMs >= w.b) throw new Error('Start time is outside the loaded period — change the dates first (Project ▸ Forecast Period & Dates).');
        const hours = Math.min(+v.hours, Math.floor((w.b - startMs) / 3600e3));
        if (hours < 1) throw new Error('Start time is too close to the end of the forecast.');
        saveOverrides(srcs, v.species);
        await A.runDispersion({ species: v.species, sources: srcs, startMs, hours, releaseHours: Math.min(v.releaseHours, hours), nPart: v.nPart, dtMin: +v.dtMin,
          outHours: v.outHours === 'auto' ? autoOut(hours) : +v.outHours,
          layerTop: v.layerTop, res: +v.res, dry: v.dry, wet: v.wet, chem: v.chem, turbulence: v.turbulence, seed: v.seed | 0,
          profilePoints: [{ name: 'CanSat site', lat: S.cfg.site.lat, lon: S.cfg.site.lon }] }, ctx);
      }
    });
    function collect() {
      return vols.filter((v) => chosen.has(v.id)).map((v) => ({ ...srcFromVolcano(v, species), rate: +rows[v.id].rate.value || 0, rise: +rows[v.id].rise.value || 0 }));
    }
  };
  function saveOverrides(srcs, species) {
    srcs.forEach((s) => { S.emisOverride[s.id] = Object.assign(S.emisOverride[s.id] || {}, { [species]: s.rate, rise: s.rise }); });
    U.lsSet('aeris.emis', S.emisOverride);
  }
  function helpDispersion() {
    return `<h3>HYSPLIT-style dispersion</h3>
      <p>Replicates NOAA HYSPLIT's Lagrangian approach in the browser, so no HYSPLIT API or READY account is needed. Particles are released from each vent and moved by forecast winds plus turbulence.</p>
      <ul><li><b>Winds:</b> GFS 0.25° (HYSPLIT's own GFS archive uses the same model) at 10 m, 1000, 925, 850 and 700 hPa, interpolated in space, height and time.</li>
      <li><b>Advection:</b> Petterssen predictor–corrector (as HYSPLIT).</li>
      <li><b>Mixing:</b> GFS boundary-layer height caps vertical mixing; Pasquill class sets K<sub>z</sub>, K<sub>h</sub>.</li>
      <li><b>Terrain:</b> terrain-following inside the mixed layer, constant altitude above it, so summit plumes at night stay aloft.</li>
      <li><b>Removal:</b> dry deposition, rain scavenging, SO₂→sulfate conversion.</li>
      <li><b>Output:</b> 1-h mean concentration 0–100 m AGL (CanSat layer), contours, particles, arrival time, town exposure.</li></ul>
      <p><b>Emission rates are scenarios.</b> Mt. Apo and Mt. Leonard Kniaseff have no routine SO₂ flux measurements; enter PHIVOLCS values when available.</p>
      <p>Use <i>Project ▸ Export ▸ HYSPLIT CONTROL</i> to rerun the same case in official HYSPLIT for validation.</p>`;
  }

  /* ---------- trajectories ---------- */
  X.runTrajectories = function (ids, opts = {}) {
    if (!MET.ready) return;
    const w = metWindow();
    const start = opts.startMs || (A.activeResult() ? A.activeResult().params.startMs : w.start);
    const hours = Math.min(opts.hours || 24, Math.floor((w.b - start) / 3600e3));
    const heights = opts.heights || [100, 500, 1500];
    S.traj = MODEL.runTrajectories({
      points: ids.map((id) => { const v = D.volcanoById(id); return { id, name: v.name, lat: v.lat, lon: v.lon, groundMSL: v.elev }; }),
      heights, startMs: start, hours, dir: 1, dtMin: 10
    });
    renderTraj();
    A.setVisible('traj', true);
    if (!opts.silent) UI.message('Trajectories', `${S.traj.length} forward trajectories (${heights.join(' / ')} m above vent), ${hours} h from ${U.fmtPHT(start, true)}.`, 'ok', 6000);
    UI.log(`Forward trajectories: ${ids.join(', ')} · ${hours} h`, 'info', 'Processing');
  };
  X.trajDialog = function (pt) {
    if (!MET.ready) return;
    const w = metWindow();
    const opts = D.volcanoes.map((v) => ({ value: v.id, label: v.name + (v.priority ? ' ★' : '') }));
    if (pt) opts.unshift({ value: 'pt', label: `Map point ${U.fmtLL(pt.lat, pt.lon, 3)}` });
    UI.algorithmDialog({
      id: 'dlg-traj', title: 'Forward Trajectories (HYSPLIT)', icon: 'traj', width: 700, height: 520,
      help: `<h3>Forward trajectories</h3><p>Mean-wind paths (no turbulence) from each start height, like HYSPLIT's trajectory model. They show where a puff released now goes; the dispersion run adds spread and concentration.</p><p>Markers every 6 h (▲ ■ ● as in HYSPLIT plots). The vertical panel is in <i>Attribute table ▸ Trajectory points</i>.</p>`,
      fields: [
        { type: 'select', key: 'src', label: 'Start location', value: pt ? 'pt' : 'leonard', options: opts },
        { type: 'checkbox', key: 'both', label: 'Also run from the other priority volcano', value: !pt },
        { type: 'text', key: 'heights', label: 'Start heights (m above vent / ground, comma-separated)', value: '100, 500, 1500' },
        { type: 'datetime', key: 'start', label: 'Start (UTC)', value: U.toUTCInput(w.start), min: U.toUTCInput(w.a), max: U.toUTCInput(w.b - 3600e3) },
        { type: 'number', key: 'hours', label: 'Duration (h)', value: 24, min: 1, max: 72 }
      ],
      run: async (v) => {
        const heights = v.heights.split(/[,; ]+/).map(Number).filter((x) => isFinite(x) && x >= 0).slice(0, 5);
        const startMs = U.fromUTCInput(v.start);
        const hours = Math.min(v.hours, Math.floor((w.b - startMs) / 3600e3));
        let points;
        if (v.src === 'pt') { const terr = MET.terrainAt(pt.lat, pt.lon); points = [{ id: 'pt', name: 'Map point', lat: pt.lat, lon: pt.lon, groundMSL: isFinite(terr) ? terr : 0 }]; }
        else {
          const ids = [v.src];
          if (v.both) ids.push(...['apo', 'leonard'].filter((x) => x !== v.src));
          points = ids.map((id) => { const vv = D.volcanoById(id); return { id, name: vv.name, lat: vv.lat, lon: vv.lon, groundMSL: vv.elev }; });
        }
        S.traj = MODEL.runTrajectories({ points, heights, startMs, hours, dir: 1, dtMin: 10 });
        renderTraj(); A.setVisible('traj', true);
        S.traj.forEach((t) => { const e = t.pts[t.pts.length - 1]; if (e) AERIS.ui.getWindow('dlg-traj').log(`${t.origin} @ ${t.height} m → ${U.fmtLL(e.lat, e.lon, 2)} after ${((e.t - t.pts[0].t) / 3600e3).toFixed(0)} h, ${U.fmtNum(e.zAGL)} m AGL`); });
      }
    });
  };
  function trajLayer(list, dashed) {
    const g = [];
    list.forEach((tr) => {
      if (tr.pts.length < 2) return;
      const ll = tr.pts.map((p) => [p.lat, p.lon]);
      g.push(L.polyline(ll, { pane: 'traj', color: '#fff', weight: 5, opacity: 0.8 }));
      const line = L.polyline(ll, { pane: 'traj', color: tr.color, weight: 2.4, dashArray: dashed ? '7 5' : null });
      const end = tr.pts[tr.pts.length - 1];
      line.bindTooltip(`${tr.dir > 0 ? 'Forward' : 'Backward'} trajectory · ${U.esc(tr.origin)} · ${tr.height} m ${tr.dir > 0 ? 'above vent' : 'AGL'}<br>${tr.dir > 0 ? 'End' : 'Origin'}: ${U.fmtLL(end.lat, end.lon, 2)} at ${U.fmtNum(end.zAGL)} m AGL, ${U.fmtPHT(end.t, true)}`, { sticky: true, className: 'aeris-tip' });
      g.push(line);
      tr.pts.forEach((p, i) => {
        const hrs = Math.abs(p.t - tr.pts[0].t) / 3600e3;
        if (i > 0 && Math.abs(hrs % 6) < 1e-6) {
          const m = L.marker([p.lat, p.lon], { icon: ML.shapeIcon(tr.shape, tr.color, 9), pane: 'traj', keyboard: false });
          m.bindTooltip(`${tr.dir > 0 ? '+' : '−'}${hrs} h · ${U.fmtPHT(p.t, true)} · ${U.fmtNum(p.zAGL)} m AGL`, { className: 'aeris-tip' });
          g.push(m);
        }
      });
    });
    return g;
  }
  function renderTraj() {
    S.lg.traj.clearLayers();
    if (S.traj) trajLayer(S.traj, false).forEach((l) => S.lg.traj.addLayer(l));
    A.renderTree();
  }

  X.runBackTraj = function (opts = {}) {
    if (!MET.ready) return;
    const w = metWindow();
    const arrive = U.clamp(opts.arriveMs || S.cfg.flightTime || w.start, w.a + 3600e3, w.b);
    const hours = Math.min(opts.hours || 24, Math.floor((arrive - w.a) / 3600e3));
    const terr = MET.terrainAt(S.cfg.site.lat, S.cfg.site.lon);
    const heights = opts.heights || [50, 100, 500];
    S.back = MODEL.runTrajectories({ points: [{ id: 'site', name: 'CanSat site', lat: S.cfg.site.lat, lon: S.cfg.site.lon, groundMSL: isFinite(terr) ? terr : 0 }],
      heights, startMs: arrive, hours, dir: -1, dtMin: 10 });
    const cols = ['#7b1fa2', '#00838f', '#ef6c00'];
    S.back.forEach((t, i) => (t.color = cols[i % 3]));
    S.attribution = MODEL.attribute(S.back, 25);
    S.lg.back.clearLayers();
    trajLayer(S.back, true).forEach((l) => S.lg.back.addLayer(l));
    A.setVisible('back', true);
    const a = S.attribution[0];
    const msg = a ? `Air arriving at the CanSat site (${U.fmtPHT(arrive, true)}) at ${a.height} m AGL passed <b>${a.distKm.toFixed(1)} km from ${U.esc(a.volcano)}</b> ${a.hoursBefore.toFixed(0)} h earlier, at ${U.fmtNum(a.zMSL)} m MSL.`
      : `No volcano within 25 km of the ${hours}-h back-trajectories: gases read by the CanSat would be local (hot spring) or background.`;
    if (!opts.silent) UI.message('Source attribution', msg, a ? 'info' : 'ok', 10000);
    UI.log('Back-trajectory attribution: ' + msg.replace(/<[^>]+>/g, ''), 'info', 'Processing');
    A.renderRight();
  };
  X.backTrajDialog = function () {
    if (!MET.ready) return;
    const w = metWindow();
    UI.algorithmDialog({
      id: 'dlg-back', title: 'Backward Trajectories — CanSat Source Attribution', icon: 'backtraj', width: 700, height: 500,
      help: `<h3>Where did the sampled air come from?</h3><p>Backward trajectories end at the CanSat site at the flight time. If a path passes over Mt. Leonard Kniaseff or Mt. Apo within about a day, gas measured during the descent may come from that volcano; otherwise it comes from the local hot-spring vents or the background.</p><p>Results fill the <i>Source attribution</i> attribute table.</p>`,
      fields: [
        { type: 'datetime', key: 'arrive', label: 'Arrival time at the site (PHT)', value: U.toPHTInput(S.cfg.flightTime || w.start), min: U.toPHTInput(w.a), max: U.toPHTInput(w.b) },
        { type: 'text', key: 'heights', label: 'Arrival heights (m AGL)', value: '50, 100, 500' },
        { type: 'number', key: 'hours', label: 'Duration back in time (h)', value: 24, min: 1, max: 48 }
      ],
      run: async (v, ctx) => {
        X.runBackTraj({ arriveMs: U.fromPHTInput(v.arrive), hours: v.hours, heights: v.heights.split(/[,; ]+/).map(Number).filter((x) => isFinite(x) && x >= 0).slice(0, 3) });
        (S.attribution.length ? S.attribution : [{ none: true }]).forEach((a) => ctx.log(a.none ? 'No volcano within 25 km of any trajectory.' :
          `${a.height} m AGL → closest approach ${a.distKm.toFixed(1)} km to ${a.volcano}, ${a.hoursBefore.toFixed(1)} h before arrival, parcel at ${U.fmtNum(a.zMSL)} m MSL (vent ${U.fmtNum(a.ventElev)} m)`));
      }
    });
  };

  /* ============================== CanSat ============================== */
  /* next 09:00 PHT inside the loaded period (first day of the period when it lies in the past or future) */
  function defaultFlightTime() {
    const w = MET.ready ? metWindow() : null;
    const now = Date.now();
    const base = w && (now < w.a || now > w.b) ? w.start : now + 1800e3;
    const d = new Date(base + 8 * 3600e3);
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 1, 0); // 09:00 PHT
    if (t < base) t += 24 * 3600e3;
    if (w) t = U.clamp(t, w.a, w.b - 2 * 3600e3);
    return t;
  }
  A.defaultFlightTime = defaultFlightTime;
  X.loadPoint = async function () {
    const key = `${S.cfg.site.lat.toFixed(4)},${S.cfg.site.lon.toFixed(4)}|${MET.period ? MET.period.start + MET.period.end : 'latest'}`;
    if (S.point && S.point.key === key) return S.point;
    S.point = await MET.fetchPoint(S.cfg.site.lat, S.cfg.site.lon);
    S.point.key = key;
    return S.point;
  };
  function csCfg() {
    const c = S.cfg;
    const [gx, gy] = U.llToLocal(c.site.lat, c.site.lon, c.gs.lat, c.gs.lon);
    const [vx, vy] = U.llToLocal(c.site.lat, c.site.lon, c.vent.lat, c.vent.lon);
    return { ...c, gs: { x: gx, y: gy }, vent: { x: vx, y: vy, H: c.vent.H, q: c.vent.q } };
  }
  function siteSO2ppb(t) {
    const R = S.results.SO2;
    if (!R) return NaN;
    const h = Math.floor((t - R.params.startMs) / ((R.outH || 1) * 3600e3));
    if (h < 0 || h >= R.frames.length) return NaN;
    const c = MODEL.sampleGrid(R.grid, R.frames[h].conc, S.cfg.site.lat, S.cfg.site.lon);
    return isFinite(c) ? D.toMixing('SO2', c) : NaN;
  }
  X.runCansat = async function (opts = {}) {
    if (!S.cfg.flightTime) S.cfg.flightTime = defaultFlightTime();
    A.busy('CanSat: fetching point forecast & air quality…');
    try {
      await X.loadPoint();
      const cfg = csCfg();
      const env0 = CS.buildEnv(S.point, S.cfg.flightTime, cfg, S.results);
      if (S.cfg.autoCanopy !== false) {
        const rho = CS.airDensity(env0.Ps, env0.T2, env0.RH2);
        S.cfg.canopyD = +CS.canopyForSpeed(S.cfg.mass, S.cfg.cd, rho, S.cfg.targetV).toFixed(3);
        cfg.canopyD = S.cfg.canopyD;
      }
      A.busy('CanSat: simulating descent, sensors and LoRa link…');
      await U.sleep0();
      S.cs = CS.simulate(cfg, env0, S.cfg.seed);
      S.mc = CS.monteCarlo(cfg, env0, S.cfg.mcRuns);
      S.gng = CS.goNoGo(cfg, env0, siteSO2ppb(S.cfg.flightTime));
      renderCansat();
      const st = S.cs.stats;
      if (!opts.silent) UI.message('CanSat simulation', `${S.gng.verdict} · ${U.fmtPHT(S.cfg.flightTime, true)} · descent ${st.descentRate.toFixed(2)} m/s, ${st.descentSamples} samples · landing ${S.cs.landing.dist.toFixed(0)} m ${U.compass(S.cs.landing.brg)} · LoRa PDR ${(st.pdr * 100).toFixed(1)} %`,
        S.gng.verdict === 'GO' ? 'ok' : S.gng.verdict === 'NO-GO' ? 'err' : 'warn', 10000, { label: 'Ground station', run: () => X.groundStation() });
      UI.log(`CanSat ${S.gng.verdict}: descent ${st.descentRate.toFixed(2)} m/s, landing ${S.cs.landing.dist.toFixed(0)} m, PDR ${(st.pdr * 100).toFixed(1)} %`, S.gng.verdict === 'NO-GO' ? 'warn' : 'info', 'Processing');
      A.renderRight();
      const gw = UI.getWindow('gs'); if (gw && gw.refresh) gw.refresh();
    } finally { A.busy(null); }
  };

  A.renderCansatPoints = function () {
    const g = S.lg['cs-points']; g.clearLayers();
    const c = S.cfg;
    const mk = (ll, kind, title, onMove) => {
      const m = L.marker(ll, { icon: ML.pinIcon(kind), draggable: true, title, zIndexOffset: 500, keyboard: false });
      m.bindTooltip(`${title}<br><span class="muted">drag to move</span>`, { className: 'aeris-tip', direction: 'top', offset: [0, -28] });
      m.on('dragend', () => { const p = m.getLatLng(); onMove(p); A.renderCansatPoints(); UI.message('CanSat', `${title} moved to ${U.fmtLL(p.lat, p.lng, 5)}.`, 'info', 6000, { label: 'Re-run simulation', run: () => X.runCansat() }); });
      g.addLayer(m);
    };
    mk([c.site.lat, c.site.lon], 'launch', 'Launch / release point', (p) => { c.site = { lat: p.lat, lon: p.lng }; });
    mk([c.gs.lat, c.gs.lon], 'gs', 'Ground station (LoRa receiver)', (p) => { c.gs = { lat: p.lat, lon: p.lng }; });
    mk([c.vent.lat, c.vent.lon], 'vent', 'Hot-spring vent (local H₂S/SO₂/CO₂ source)', (p) => { c.vent = Object.assign(c.vent, { lat: p.lat, lon: p.lng }); });
    // LoRa range ring: distance where P(reception) = 90 % with line of sight
    const d90 = (c.lora.b0 + c.lora.b2 - Math.log(0.9 / 0.1)) / -c.lora.b1;
    S.lg['cs-lora'].clearLayers();
    if (d90 > 0) S.lg['cs-lora'].addLayer(L.circle([c.gs.lat, c.gs.lon], { radius: d90, pane: 'cansat', color: '#2e7d32', weight: 1.5, dashArray: '6 4', fillOpacity: 0.04 })
      .bindTooltip(`LoRa effective range (P<sub>rx</sub> = 90 %, line of sight): ${U.fmtNum(d90)} m`, { sticky: true, className: 'aeris-tip' }));
    if (!S.mc) { S.lg['cs-excl'].clearLayers(); S.lg['cs-excl'].addLayer(L.circle([c.site.lat, c.site.lon], { radius: c.exclusion, pane: 'cansat', color: '#c62828', weight: 1.5, dashArray: '4 3', fillOpacity: 0.06 })); }
  };
  function renderCansat() {
    A.renderCansatPoints();
    const r = S.cs, mc = S.mc;
    const T = S.lg['cs-track']; T.clearLayers();
    const asc = r.track.filter((p) => p.t <= r.tRel).map((p) => p.ll);
    const des = r.track.filter((p) => p.t >= r.tRel - 0.5).map((p) => p.ll);
    T.addLayer(L.polyline(asc, { pane: 'cansat', color: '#6a1b9a', weight: 2, dashArray: '4 4' }));
    T.addLayer(L.polyline(des, { pane: 'cansat', color: '#fff', weight: 5, opacity: 0.9 }));
    T.addLayer(L.polyline(des, { pane: 'cansat', color: '#263238', weight: 2.2 }));
    r.recs.filter((p) => p.phase === 'RELEASE' || p.phase === 'DESCENT').forEach((p) => {
      const m = L.circleMarker([p.tlat, p.tlon], { pane: 'cansat', radius: 4, color: '#fff', weight: 1, fillColor: p.rx ? '#2e7d32' : '#d32f2f', fillOpacity: 1 });
      m.bindTooltip(`<b>Packet #${p.seq}</b> · MET ${p.met} s · ${p.rx ? 'received' : '<span style="color:#d32f2f">LOST (microSD only)</span>'}<br>` +
        `Alt baro ${p.altBaro.toFixed(1)} m · GPS ${p.altGps.toFixed(1)} m · true ${p.altTrue.toFixed(1)} m<br>` +
        `SO₂ ${p.so2ppb.toFixed(0)} ppb · H₂S ${p.h2s.toFixed(2)} ppm${p.h2sLOD ? ' (&lt;LOD)' : ''} · CO₂ ${p.co2} ppm<br>PM2.5 ${p.pm25} · PM10 ${p.pm10} µg/m³ · ${p.T.toFixed(2)} °C · ${p.RH.toFixed(1)} % · ${p.P.toFixed(2)} hPa<br>` +
        `<span class="mono">${U.esc(p.line)}</span>`, { className: 'aeris-tip' });
      T.addLayer(m);
    });
    const land = L.marker([r.landing.lat, r.landing.lon], { icon: ML.pinIcon('land'), keyboard: false });
    land.bindTooltip(`Predicted landing: ${r.landing.dist.toFixed(0)} m, bearing ${r.landing.brg.toFixed(0)}° (${U.compass(r.landing.brg)})<br>${U.fmtLL(r.landing.lat, r.landing.lon, 6)}`, { className: 'aeris-tip', direction: 'top', offset: [0, -28] });
    T.addLayer(land);
    const M = S.lg['cs-mc']; M.clearLayers();
    // possible descent paths (Monte-Carlo sample) and the mean drift arrow
    mc.pathsLL.forEach((pl) => M.addLayer(L.polyline(pl, { pane: 'cansat', color: '#7e57c2', weight: 1, opacity: 0.35, interactive: false })));
    mc.pointsLL.forEach((p) => M.addLayer(L.circleMarker(p, { pane: 'cansat', radius: 1.6, stroke: false, fillColor: '#6a1b9a', fillOpacity: 0.45 })));
    const ll0 = [S.cfg.site.lat, S.cfg.site.lon];
    M.addLayer(L.polyline([ll0, mc.meanLL], { pane: 'cansat', color: '#fff', weight: 6, opacity: 0.9 }));
    M.addLayer(L.polyline([ll0, mc.meanLL], { pane: 'cansat', color: '#6a1b9a', weight: 3 })
      .bindTooltip(`Most likely drift: ${U.compass(mc.meanBrg)} (${mc.meanBrg.toFixed(0)}°), ${mc.meanDist.toFixed(0)} m`, { sticky: true, className: 'aeris-tip' }));
    M.addLayer(L.marker(mc.meanLL, { icon: L.divIcon({ className: 'aeris-sym', html: `<svg width="22" height="22" viewBox="0 0 24 24" style="transform:rotate(${mc.meanBrg.toFixed(0)}deg)"><path d="M12 2l7 16-7-4-7 4z" fill="#6a1b9a" stroke="#fff" stroke-width="1.5"/></svg>`, iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false }));
    M.addLayer(L.marker(mc.meanLL, { icon: ML.label(`→ ${U.compass(mc.meanBrg)} ${mc.meanDist.toFixed(0)} m`, 'pri'), interactive: false, keyboard: false }));
    M.addLayer(L.polygon(mc.ellipseLL, { pane: 'cansat', color: '#6a1b9a', weight: 1.8, fillOpacity: 0.08 })
      .bindTooltip(`95 % landing ellipse (${S.cfg.mcRuns} Monte-Carlo descents): ${mc.a.toFixed(0)} × ${mc.b.toFixed(0)} m`, { sticky: true, className: 'aeris-tip' }));
    const E = S.lg['cs-excl']; E.clearLayers();
    E.addLayer(L.polygon(mc.exclusionLL, { pane: 'cansat', color: '#c62828', weight: 1.8, dashArray: '6 4', fillColor: '#c62828', fillOpacity: 0.06 })
      .bindTooltip(`Ground exclusion zone: launch point + predicted landing dispersion, buffered ${S.cfg.exclusion} m (proposal D.8)`, { sticky: true, className: 'aeris-tip' }));
    // local vent plume footprint (H2S ≥ WHO odour threshold at 1.5 m)
    const P = S.lg['cs-local']; P.clearLayers();
    const env = r.env, cfg = r.cfg;
    const thr = 7;
    const [u, v] = CS.windUV(env, 10);
    const sp = Math.max(0.5, Math.hypot(u, v)), ux = u / sp, uy = v / sp;
    const left = [], right = [];
    for (let x = 5; x <= 3000; x *= 1.15) {
      const cc = CS.localPlume(env, cfg, 'H2S', cfg.vent.x + ux * x, cfg.vent.y + uy * x, 1.5);
      if (cc < thr) { if (left.length) break; continue; }
      const [sy] = CS.briggs(env.cls, x);
      const yw = sy * Math.sqrt(2 * Math.log(cc / thr));
      const px = cfg.vent.x + ux * x, py = cfg.vent.y + uy * x;
      left.push(U.offsetLL(cfg.site.lat, cfg.site.lon, px - uy * yw, py + ux * yw));
      right.push(U.offsetLL(cfg.site.lat, cfg.site.lon, px + uy * yw, py - ux * yw));
    }
    if (left.length > 1) {
      const ventLL = [S.cfg.vent.lat, S.cfg.vent.lon];
      P.addLayer(L.polygon([ventLL, ...left, ...right.reverse()], { pane: 'cansat', color: '#b8860b', weight: 1.2, fillColor: '#ffd54f', fillOpacity: 0.35 })
        .bindTooltip(`Local hot-spring plume: H₂S ≥ 7 µg/m³ (WHO odour threshold) at 1.5 m · Pasquill ${env.cls} · wind ${sp.toFixed(1)} m/s`, { sticky: true, className: 'aeris-tip' }));
    }
    A.renderTree();
  }

  X.cansatDialog = function () {
    const c = S.cfg;
    if (!c.flightTime) c.flightTime = defaultFlightTime();
    const w = MET.ready ? metWindow() : null;
    const llv = (p) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
    const pick = (key, label) => ({ label: UI.icon('pick', 'width="14" height="14"'), title: 'Pick on map', action: (ctrls) => A.pickOnMap(label, (ll) => ctrls[key].set(`${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`)) });
    const rhoGuess = 1.15;
    UI.algorithmDialog({
      id: 'dlg-cansat', title: 'CanSat Descent & Telemetry Simulation', icon: 'cansat', width: 880, height: 700,
      help: helpCansat(),
      fields: [
        { type: 'datetime', key: 'time', label: 'Release time (PHT)', value: U.toPHTInput(c.flightTime), min: w ? U.toPHTInput(w.a) : undefined, max: w ? U.toPHTInput(w.b - 3600e3) : undefined },
        { type: 'group', label: 'Locations', fields: [
          { type: 'text', key: 'site', label: 'Launch / release point (lat, lon)', value: llv(c.site), button: pick('site', 'launch site') },
          { type: 'text', key: 'gs', label: 'Ground station (lat, lon)', value: llv(c.gs), button: pick('gs', 'ground station') },
          { type: 'text', key: 'vent', label: 'Hot-spring vent (lat, lon)', value: llv(c.vent), button: pick('vent', 'hot-spring vent') },
          { type: 'custom', render: () => el('div', { class: 'field' }, [el('label', { class: 'fl', text: 'Local vent emission (g/s): H₂S · SO₂ · CO₂' }), el('div', { class: 'row3' }, [
            el('input', { type: 'number', step: 'any', id: 'vq1', value: c.vent.q.H2S }), el('input', { type: 'number', step: 'any', id: 'vq2', value: c.vent.q.SO2 }), el('input', { type: 'number', step: 'any', id: 'vq3', value: c.vent.q.CO2 })])]),
            key: 'ventQ', get: () => [+document.getElementById('vq1').value, +document.getElementById('vq2').value, +document.getElementById('vq3').value], set: () => {} }
        ] },
        { type: 'group', label: 'Flight profile (proposal D.2, D.8)', fields: [
          { type: 'number', key: 'releaseAGL', label: 'Release altitude (m AGL)', value: c.releaseAGL, min: 10, max: 122, hint: 'CAAP ceiling 400 ft ≈ 122 m.' },
          { type: 'number', key: 'ascentRate', label: 'Drone climb rate (m/s)', value: c.ascentRate, min: 0.5, max: 6, step: 0.1 },
          { type: 'number', key: 'hoverSec', label: 'Hover before release (s)', value: c.hoverSec, min: 0, max: 120 }
        ] },
        { type: 'group', label: 'Parachute & payload', fields: [
          { type: 'number', key: 'mass', label: 'Total payload mass (kg)', value: c.mass, min: 0.1, max: 1, step: 0.01, hint: 'Proposal: 0.35 kg (design range 0.20–0.45 kg).' },
          { type: 'number', key: 'cd', label: 'Canopy drag coefficient C<sub>d</sub>', value: c.cd, min: 0.5, max: 2.5, step: 0.05 },
          { type: 'number', key: 'targetV', label: 'Target descent rate (m/s)', value: c.targetV, min: 1, max: 10, step: 0.1 },
          { type: 'checkbox', key: 'autoCanopy', label: 'Size the canopy automatically for the target rate (site air density)', value: c.autoCanopy !== false },
          { type: 'number', key: 'canopyD', label: 'Canopy diameter (m) — used when auto-size is off', value: c.canopyD, min: 0.1, max: 2, step: 0.01,
            hint: `Proposal lists a 1.0 m canopy (Table 5) and a 34 cm canopy (D.4); at ρ≈${rhoGuess} kg/m³ these give ≈${CS.terminalVelocity(0.35, 1.5, rhoGuess, 1.0).toFixed(1)} and ≈${CS.terminalVelocity(0.35, 1.5, rhoGuess, 0.34).toFixed(1)} m/s.` },
          { type: 'number', key: 'inflation', label: 'Canopy inflation time (s)', value: c.inflation, min: 0.2, max: 5, step: 0.1 }
        ] },
        { type: 'group', label: 'LoRa link model (proposal §E): P = 1 / (1 + e^−(β0 + β1·d + β2·LOS))', fields: [
          { type: 'custom', key: 'lora', render: () => el('div', { class: 'field row3' }, [
            el('label', {}, ['β0 ', el('input', { type: 'number', step: 'any', id: 'lb0', value: c.lora.b0 })]),
            el('label', {}, ['β1 (per m) ', el('input', { type: 'number', step: 'any', id: 'lb1', value: c.lora.b1 })]),
            el('label', {}, ['β2 (LOS) ', el('input', { type: 'number', step: 'any', id: 'lb2', value: c.lora.b2 })])]),
            get: () => ({ b0: +document.getElementById('lb0').value, b1: +document.getElementById('lb1').value, b2: +document.getElementById('lb2').value }), set: () => {} }
        ] },
        { type: 'group', label: 'Monte Carlo & safety', fields: [
          { type: 'number', key: 'mcRuns', label: 'Monte-Carlo descents for landing ellipse', value: c.mcRuns, min: 50, max: 2000, step: 50 },
          { type: 'number', key: 'exclusion', label: 'Exclusion buffer (m)', value: c.exclusion, min: 10, max: 300 },
          { type: 'number', key: 'seed', label: 'Random seed (flight noise)', value: c.seed, step: 1 }
        ] }
      ],
      run: async (v, ctx) => {
        const ll = (s) => { const m = String(s).split(/[,; ]+/).map(Number); if (m.length < 2 || !isFinite(m[0]) || !isFinite(m[1])) throw new Error('Bad coordinate: ' + s); return { lat: m[0], lon: m[1] }; };
        const site = ll(v.site);
        const moved = U.haversine(site.lat, site.lon, c.site.lat, c.site.lon) > 1;
        Object.assign(c, { flightTime: U.fromPHTInput(v.time), site, gs: ll(v.gs), releaseAGL: v.releaseAGL, ascentRate: v.ascentRate, hoverSec: v.hoverSec,
          mass: v.mass, cd: v.cd, targetV: v.targetV, autoCanopy: v.autoCanopy, canopyD: v.canopyD, inflation: v.inflation, lora: v.lora,
          mcRuns: v.mcRuns | 0, exclusion: v.exclusion, seed: v.seed | 0 });
        c.vent = Object.assign(c.vent, ll(v.vent), { q: { H2S: v.ventQ[0], SO2: v.ventQ[1], CO2: v.ventQ[2] } });
        if (moved) ctx.log('Launch site moved — regional plume profile only available from dispersion runs made for the new site.', 'warn');
        ctx.progress(0.3);
        await X.runCansat();
        const st = S.cs.stats;
        ctx.log(`Air density ${S.cs.rho.toFixed(3)} kg/m³ · canopy ${S.cfg.canopyD.toFixed(3)} m · theoretical v_t ${S.cs.vtTheory.toFixed(2)} m/s`);
        ctx.log(`Measured descent ${st.descentRate.toFixed(2)} m/s over ${S.cs.descentTime.toFixed(1)} s → ${st.descentSamples} samples at 1 Hz`);
        ctx.log(`Landing ${S.cs.landing.dist.toFixed(0)} m at ${S.cs.landing.brg.toFixed(0)}° · 95 % ellipse ${S.mc.a.toFixed(0)} × ${S.mc.b.toFixed(0)} m`);
        ctx.log(`LoRa: ${st.received}/${st.packets} packets (${(st.pdr * 100).toFixed(1)} %), gaps > 3 s: ${st.gaps3s}`);
        ctx.log(`Altitude RMSE: baro ${st.altRmseBaro.toFixed(2)} m, GPS ${st.altRmseGps.toFixed(2)} m`);
        ctx.log(`Go/No-Go: ${S.gng.verdict}`, S.gng.verdict === 'NO-GO' ? 'err' : S.gng.verdict === 'GO' ? 'ok' : 'warn');
        X.groundStation();
      }
    });
  };
  function helpCansat() {
    return `<h3>CanSat mission simulation</h3>
      <p>Simulates one AERIS flight at the Mainit/Toyozu site using the proposal's hardware and procedures.</p>
      <ul><li><b>Weather:</b> hourly forecast at the site (Open-Meteo), with winds at 10/80/120 m, gusts, rain, visibility and CAPE.</li>
      <li><b>Descent:</b> m·dv/dt = m·g − ½·ρ·C<sub>d</sub>·A·v², with ρ from site pressure, temperature and humidity and the canopy inflating over the set time.</li>
      <li><b>Drift:</b> wind profile (log law below 10 m) plus gusts; 300 Monte-Carlo runs give the 95 % landing ellipse and the exclusion zone.</li>
      <li><b>Gas truth:</b> CAMS background + the regional volcanic plume from the dispersion run + a Gaussian plume from the hot-spring vent.</li>
      <li><b>Sensors:</b> datasheet t90 lag, noise, LOD and humidity bias (SO2-B4, MQ-136, MH-Z19B, PMS5003, BME280, NEO-6M).</li>
      <li><b>Telemetry:</b> 1 Hz packets with CRC-16; LoRa reception from the logistic model; the microSD log fills lost packets.</li></ul>
      <p>The go/no-go check applies the proposal's limits: wind ≤ 10 m/s, no rain or lightning, visibility ≥ 2 km, ≤ 122 m AGL.</p>`;
  }

  /* ---------- Deploy on the 2D map: new gust realisation, animated flight, drift arrow & possible paths ---------- */
  let deployAnim = null;
  X.deploy = async function () {
    S.cfg.seed = (S.cfg.seed || 1) + 1;
    await X.runCansat({ silent: true });
    const r = S.cs, mc = S.mc;
    ['cs-track', 'cs-mc', 'cs-excl', 'cs-points'].forEach((id) => A.setVisible(id, true));
    const b = L.latLngBounds(mc.pointsLL.concat([[S.cfg.site.lat, S.cfg.site.lon], [S.cfg.gs.lat, S.cfg.gs.lon]]));
    S.map.fitBounds(b.pad(0.35), { maxZoom: 19, animate: false });
    if (deployAnim) { cancelAnimationFrame(deployAnim.raf); deployAnim.layer.remove(); }
    const layer = L.layerGroup().addTo(S.map);
    const trail = L.polyline([], { pane: 'measure', color: '#ff6d00', weight: 4 }).addTo(layer);
    const icon = () => L.divIcon({ className: 'aeris-sym deploy-can', html: `<div class="dc-body">${UI.icon('cansat', 'width="26" height="26"')}</div><div class="dc-lbl" id="dcLbl"></div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    const mk = L.marker([S.cfg.site.lat, S.cfg.site.lon], { icon: icon(), pane: 'measure', interactive: false, keyboard: false }).addTo(layer);
    const speed = 4, t0 = performance.now(), tEnd = r.track[r.track.length - 1].t;
    const step = () => {
      const t = Math.min(tEnd, (performance.now() - t0) / 1000 * speed);
      const tr = r.track; let i = 0; while (i < tr.length - 2 && tr[i + 1].t < t) i++;
      const a = tr[i], bb = tr[i + 1], f = U.clamp((t - a.t) / (bb.t - a.t), 0, 1);
      const la = a.ll[0] + (bb.ll[0] - a.ll[0]) * f, lo = a.ll[1] + (bb.ll[1] - a.ll[1]) * f, z = a.z + (bb.z - a.z) * f;
      mk.setLatLng([la, lo]);
      if (t >= r.tRel) trail.addLatLng([la, lo]);
      const rec = r.recs[Math.min(r.recs.length - 1, Math.floor(t))];
      const lbl = document.getElementById('dcLbl');
      if (lbl) lbl.innerHTML = `${rec.phase} · ${Math.max(0, z).toFixed(0)} m${t >= r.tRel && z > 0 ? ` · ${rec.so2ppb.toFixed(0)} ppb SO₂` : ''}`;
      if (t < tEnd) deployAnim.raf = requestAnimationFrame(step);
      else UI.status(`CanSat landed ${r.landing.dist.toFixed(0)} m ${U.compass(r.landing.brg)} of the launch point`);
    };
    deployAnim = { layer, raf: requestAnimationFrame(step) };
    UI.message('CanSat deployed', `Most likely drift <b>→ ${U.compass(mc.meanBrg)} ${mc.meanDist.toFixed(0)} m</b> (${mc.meanBrg.toFixed(0)}°); 95 % of ${S.cfg.mcRuns} simulated descents land inside a ${mc.a.toFixed(0)} × ${mc.b.toFixed(0)} m ellipse. This deployment: ${r.landing.dist.toFixed(0)} m ${U.compass(r.landing.brg)}, ${r.stats.descentRate.toFixed(2)} m/s, ${S.gng.verdict}.`,
      S.gng.verdict === 'NO-GO' ? 'warn' : 'ok', 14000, { label: 'Open 3D view', run: () => AERIS.scene3d.open() });
  };
  A.initMapControls = function (map) {
    const Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const d = L.DomUtil.create('div', 'deploy-ctl');
        d.innerHTML = `<button class="dbtn primary" title="Release the CanSat from 100 m and watch where it drifts">🚀 Deploy CanSat</button><button class="dbtn" title="Open the 3D deployment simulation">3D view</button><button class="dbtn" title="Numbered figures for every result">Figures</button>`;
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        const [b1, b2, b3] = d.querySelectorAll('button');
        b1.onclick = () => X.deploy(); b2.onclick = () => AERIS.scene3d.open({ deploy: true }); b3.onclick = () => AERIS.figures.open();
        return d;
      }
    });
    new Ctl().addTo(map);
  };

  /* ---------- flight-window calendar (all days of the loaded period × 24 PHT hours) ---------- */
  A.flightCalendar = function () {
    if (!S.point) return null;
    const cfg = csCfg();
    const a = S.point.t0, b = S.point.t0 + (S.point.nt - 1) * 3600e3;
    const days = new Map();
    for (let t = Math.ceil(a / 3600e3) * 3600e3; t <= b; t += 3600e3) {
      const key = A.dayKey(t), h = new Date(t + 8 * 3600e3).getUTCHours();
      if (!days.has(key)) days.set(key, { key, hours: new Array(24).fill(null) });
      const env = CS.buildEnv(S.point, t, cfg, {});
      const g = CS.goNoGo(cfg, env, NaN);
      days.get(key).hours[h] = { t, v: g.verdict, ws: g.wsRel, rain: env.precip, day: h >= 6 && h <= 17, fail: g.checks.filter((c) => !c.ok).map((c) => c.item.split(' (')[0]).join('; ') };
    }
    const P = MET.period;
    return { days: [...days.values()].filter((d) => !P || (d.key >= P.start && d.key <= P.end)) };
  };

  /* ---------- forecast period dialog ---------- */
  X.periodDialog = function () {
    const Lm = MET.limits(), cur = MET.period;
    const todayPHT = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
    UI.window({ id: 'period', title: 'Forecast Period & Dates', icon: 'clock', width: 600, height: 560, content: (body, api) => {
      const pad = el('div', { class: 'pad', style: { background: 'var(--panel)', flex: 1, overflow: 'auto' } });
      const rLatest = el('input', { type: 'radio', name: 'pm', value: 'latest' }), rCustom = el('input', { type: 'radio', name: 'pm', value: 'custom' });
      rLatest.checked = !cur; rCustom.checked = !!cur;
      const s = el('input', { type: 'date', min: Lm.min, max: Lm.max, value: cur ? cur.start : todayPHT });
      const e = el('input', { type: 'date', min: Lm.min, max: Lm.max, value: cur ? cur.end : addDays(todayPHT, 6) });
      const info = el('div', { class: 'period-info' });
      const upd = () => {
        const custom = rCustom.checked;
        s.disabled = e.disabled = !custom;
        if (!custom) { info.innerHTML = '<b>Latest forecast:</b> yesterday → 3 days ahead (NOAA GFS 0.25°), refreshed every 3 hours.'; return; }
        const err = MET.validatePeriod(s.value, e.value);
        if (err) { info.innerHTML = `<span style="color:var(--bad)"><b>${U.esc(err)}</b></span>`; return; }
        const days = (Date.parse(e.value) - Date.parse(s.value)) / 86400e3 + 1;
        const past = e.value < todayPHT, future = s.value > todayPHT;
        info.innerHTML = `<b>${days} day${days > 1 ? 's' : ''}</b> · ${past ? 'past dates → archived GFS runs (Open-Meteo Historical Forecast API)' : future ? 'future dates → GFS forecast (skill drops after about 7 days)' : 'includes today → GFS forecast'}<br>
          Download ≈ ${(days * 0.75 + 0.3).toFixed(1)} MB of gridded winds (cached in the browser). Air-quality background (CAMS) is available only up to 6 days ahead.<br>
          After loading, the SO₂ forecast for Mt. Apo & Mt. Leonard Kniaseff and the CanSat flight are re-run for the new dates.`;
      };
      [rLatest, rCustom, s, e].forEach((n) => n.addEventListener('input', upd));
      [rLatest, rCustom].forEach((n) => n.addEventListener('change', upd));
      const quick = (lbl, a, b) => el('button', { class: 'btn small', text: lbl, onclick: () => { rCustom.checked = true; s.value = a; e.value = b; upd(); } });
      pad.append(
        el('div', { class: 'field' }, [el('label', { class: 'chk' }, [rLatest, el('span', { html: '<b>Latest forecast</b> (default)' })])]),
        el('div', { class: 'field' }, [el('label', { class: 'chk' }, [rCustom, el('span', { html: '<b>Custom dates</b> (Philippine time, up to 14 days)' })])]),
        el('div', { class: 'field row2' }, [el('label', {}, ['Start date', s]), el('label', {}, ['End date', e])]),
        el('div', { class: 'field' }, [el('label', { class: 'fl', text: 'Quick ranges' }), el('div', { class: 'acts', style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, [
          quick('Next 3 days', todayPHT, addDays(todayPHT, 2)), quick('Next 7 days', todayPHT, addDays(todayPHT, 6)), quick('Next 14 days', todayPHT, addDays(todayPHT, 13)),
          quick('Past 7 days', addDays(todayPHT, -7), addDays(todayPHT, -1)), quick('Same week last year', addDays(todayPHT, -365), addDays(todayPHT, -359)),
          quick('Habagat example (Aug 2025)', '2025-08-04', '2025-08-10'), quick('Amihan example (Jan 2026)', '2026-01-12', '2026-01-18')])]),
        info,
        el('div', { class: 'hint', style: { marginTop: '10px' }, html: 'Tip: choose your planned field-test dates to plan CanSat flights with the flight-window calendar (Ground station ▸ Go/No-Go). Choose past dates to replay what the plume did on a specific day.' })
      );
      body.append(pad, el('div', { class: 'win-foot' }, [el('span', { class: 'spacer' }),
        el('button', { class: 'btn primary', text: 'Load period', onclick: async () => {
          const p = rCustom.checked ? { start: s.value, end: e.value } : null;
          if (p) { const err = MET.validatePeriod(p.start, p.end); if (err) { upd(); return; } }
          api.close();
          await X.applyPeriod(p);
        } }),
        el('button', { class: 'btn', text: 'Cancel', onclick: () => api.close() })]));
      upd();
    } });
  };
  X.applyPeriod = async function (p) {
    MET.setPeriod(p);
    if (S.playing) A.togglePlay();
    A.busy('Loading meteorology for the new period…');
    try {
      await MET.load({ onMsg: (m) => A.busy(m) });
    } finally { A.busy(null); }
    S.results = {}; S.activeSpecies = null; S.traj = null; S.back = null; S.attribution = []; S.cs = null; S.mc = null; S.gng = null; S.campaign = null; S.point = null;
    ['traj', 'back', 'cs-track', 'cs-mc', 'cs-excl', 'cs-local', 'maxconc', 'arrival'].forEach((k) => S.lg[k].clearLayers());
    S.ti = 0;
    S.cfg.flightTime = defaultFlightTime();
    updatePeriodLabel();
    A.buildTimeline(); A.renderTime(); A.renderTree(); A.renderRight();
    if (MET.source !== 'open-meteo') UI.message('Offline', `Open-Meteo could not be reached for these dates (${U.esc(MET.fetchError || '')}); using climatology.`, 'warn', 0);
    else UI.message('Period loaded', `${U.esc(MET.periodLabel())} — ${U.esc(MET.describe())}`, 'ok', 8000);
    await X.autoRun(Math.min(48, Math.floor((MET.timeRange()[1] - metWindow().start) / 3600e3)));
    const g = UI.getWindow('gs'); if (g && g.refresh) g.refresh();
    const f = UI.getWindow('figures'); if (f && f.refresh) f.refresh();
  };
  function updatePeriodLabel() {
    const l = document.getElementById('tbPeriodLbl'); if (l) l.textContent = MET.periodLabel();
  }
  A.updatePeriodLabel = updatePeriodLabel;

  /* ---------- ground-station window ---------- */
  let charts = [];
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function chartDefaults() {
    Chart.defaults.color = cssVar('--text') || '#222';
    Chart.defaults.borderColor = cssVar('--border-soft') || '#ddd';
    Chart.defaults.font.family = 'Segoe UI, Noto Sans, sans-serif';
    Chart.defaults.font.size = 10.5;
    Chart.defaults.animation = false;
  }
  A.onThemeChange = () => { const w = UI.getWindow('gs'); if (w && w.refresh) w.refresh(); };
  X.groundStation = function () {
    if (!S.cs) { X.runCansat().then(() => X.groundStation()); return; }
    const existing = UI.getWindow('gs');
    if (existing) { existing.refresh(); existing.focus(); return; }
    const win = UI.window({
      id: 'gs', title: 'AERIS CanSat Ground Station', icon: 'cansat', width: Math.min(1180, window.innerWidth - 40), height: Math.min(800, window.innerHeight - 40),
      onClose: () => { charts.forEach((c) => c.destroy()); charts = []; },
      content: (body, api) => {
        const tabs = UI.tabs(body, [{ id: 'flight', label: 'Flight profiles' }, { id: 'console', label: 'Telemetry console' }, { id: 'gng', label: 'Go / No-Go & flight calendar' }, { id: 'camp', label: 'Six-flight campaign' }]);
        body.querySelector('.wtabs').append(el('span', { style: { flex: 1 } }),
          el('button', { class: 'btn small', text: '🚀 3D deployment', onclick: () => AERIS.scene3d.open({ deploy: true }) }),
          el('button', { class: 'btn small', text: '📅 Dates', onclick: () => X.periodDialog() }),
          el('button', { class: 'btn small', text: 'Figures', onclick: () => AERIS.figures.open() }));
        api.tabs = tabs;
        api.refresh = () => { charts.forEach((c) => c.destroy()); charts = []; chartDefaults(); gsFlight(tabs.panes.flight); gsConsole(tabs.panes.console); gsGng(tabs.panes.gng); gsCampaign(tabs.panes.camp); };
        api.refresh();
      }
    });
    return win;
  };
  function kpi(k, v, sub) { return `<div class="gs-kpi"><div class="k">${k}</div><div class="v">${v}${sub ? ` <small>${sub}</small>` : ''}</div></div>`; }
  function gsFlight(pane) {
    pane.innerHTML = '';
    const r = S.cs, st = r.stats, g = S.gng;
    pane.appendChild(el('div', { class: 'gs-top', html:
      kpi('Verdict', `<span class="pill ${g.verdict === 'GO' ? 'go' : g.verdict === 'NO-GO' ? 'nogo' : 'caution'}" style="font-size:13px">${g.verdict}</span>`) +
      kpi('Release (PHT)', U.fmtPHT(S.cfg.flightTime).replace(' PHT', ''), new Date(S.cfg.flightTime + 8 * 3600e3).toISOString().slice(0, 10)) +
      kpi('Descent rate', st.descentRate.toFixed(2), `m/s (theory ${r.vtTheory.toFixed(2)})`) +
      kpi('Descent time', r.descentTime.toFixed(1), `s · ${st.descentSamples} samples`) +
      kpi('Landing', r.landing.dist.toFixed(0), `m ${U.compass(r.landing.brg)}`) +
      kpi('LoRa PDR', (st.pdr * 100).toFixed(1), `% · ${st.received}/${st.packets}`) +
      kpi('Gaps > 3 s', st.gaps3s) +
      kpi('Alt RMSE', st.altRmseBaro.toFixed(1), `m baro · ${st.altRmseGps.toFixed(1)} GPS`) +
      kpi('Max SO₂', st.maxSO2.toFixed(0), 'ppb (sensor)') +
      kpi('Canopy', S.cfg.canopyD.toFixed(2), `m · ρ ${r.rho.toFixed(3)}`) }));
    const grid = el('div', { class: 'gs-charts' });
    pane.appendChild(grid);
    const recs = r.recs;
    const desc = recs.filter((p) => p.phase === 'DESCENT' || p.phase === 'RELEASE');
    const asc = recs.filter((p) => p.phase === 'ASCENT' || p.phase === 'HOVER');
    const box = (wide) => { const d = el('div', { class: 'cc' + (wide ? ' wide' : '') }); const cv = el('canvas'); d.appendChild(cv); grid.appendChild(d); return cv; };
    const line = (cv, cfg) => charts.push(new Chart(cv, cfg));
    const opts = (title, xl, yl, extra = {}) => ({ responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: title, font: { weight: 600, size: 11.5 } }, legend: { labels: { boxWidth: 10, boxHeight: 2 } } },
      scales: { x: { type: 'linear', title: { display: true, text: xl } }, y: { type: 'linear', title: { display: true, text: yl } } }, ...extra });
    line(box(true), { type: 'line', data: { datasets: [
      { label: 'True altitude', data: recs.map((p) => ({ x: p.met, y: p.altTrue })), borderColor: '#9e9e9e', borderWidth: 3, pointRadius: 0 },
      { label: 'Barometric (firmware)', data: recs.map((p) => ({ x: p.met, y: p.altBaro })), borderColor: '#1f77b4', borderWidth: 1.5, pointRadius: 1.5 },
      { label: 'GPS NEO-6M', data: recs.map((p) => ({ x: p.met, y: p.altGps })), borderColor: '#ff7f0e', borderWidth: 1.2, borderDash: [4, 3], pointRadius: 0 }
    ] }, options: opts('Altitude vs mission-elapsed time', 'MET (s)', 'Altitude AGL (m)') });
    line(box(true), { type: 'bar', data: { datasets: [
      { type: 'bar', label: 'Packet received', data: recs.map((p) => ({ x: p.met, y: p.rx ? 1 : 0 })), backgroundColor: recs.map((p) => (p.rx ? '#2e7d32' : '#d32f2f')), barPercentage: 1, categoryPercentage: 1 },
      { type: 'line', label: 'P(receive) model', data: recs.map((p) => ({ x: p.met, y: p.pRx })), borderColor: '#555', borderWidth: 1.2, pointRadius: 0 }
    ] }, options: opts(`LoRa packet reception — PDR ${(st.pdr * 100).toFixed(1)} %, descent ${(st.pdrDescent * 100).toFixed(0)} %`, 'MET (s)', 'Received (1/0)', {}) });
    const prof = (title, key, truthKey, unit, conv = 1, extra) => {
      const ds = [
        { label: 'True profile', data: desc.map((p) => ({ x: p.truth[truthKey] * conv, y: p.altTrue })), borderColor: '#9e9e9e', borderWidth: 3, pointRadius: 0 },
        { label: 'Sensor (descent)', data: desc.map((p) => ({ x: p[key], y: p.altBaro })), borderColor: '#d62728', backgroundColor: '#d62728', borderWidth: 1.4, pointRadius: 2 },
        { label: 'Sensor (ascent)', data: asc.map((p) => ({ x: p[key], y: p.altBaro })), borderColor: '#1f77b4', borderWidth: 1, borderDash: [3, 3], pointRadius: 0 }
      ];
      if (extra) ds.push(extra);
      const rg = r.regress[key];
      line(box(false), { type: 'line', data: { datasets: ds }, options: opts(`${title}${rg && isFinite(rg.slope100) ? ` · slope ${U.fmtSig(rg.slope100)}/100 m, R² ${rg.r2.toFixed(2)}` : ''}`, unit, 'Altitude AGL (m)', { plugins: { title: { display: true, text: title, font: { weight: 600, size: 11.5 } }, subtitle: { display: !!(rg && isFinite(rg.slope100)), text: rg && isFinite(rg.slope100) ? `per-flight regression: ${U.fmtSig(rg.slope100)} ${unit}/100 m · R² ${rg.r2.toFixed(2)} · n=${rg.n}` : '' }, legend: { labels: { boxWidth: 10, boxHeight: 2 } } } }) });
    };
    prof('SO₂ — Alphasense SO2-B4', 'so2ppb', 'so2ppb', 'ppb');
    prof('H₂S — MQ-136', 'h2s', 'h2sppb', 'ppm', 1 / 1000, { label: 'LOD 1 ppm', data: [{ x: 1, y: 0 }, { x: 1, y: S.cfg.releaseAGL }], borderColor: '#ff9800', borderDash: [5, 4], pointRadius: 0, borderWidth: 1.2 });
    prof('CO₂ — MH-Z19B (t90 120 s)', 'co2', 'co2', 'ppm');
    prof('PM2.5 — PMS5003', 'pm25', 'pm25', 'µg/m³');
    prof('PM10 — PMS5003', 'pm10', 'pm10', 'µg/m³');
    prof('Temperature — BME280', 'T', 'T', '°C');
    prof('Relative humidity — BME280', 'RH', 'RH', '%');
    prof('Pressure — BME280', 'P', 'P', 'hPa');
    // regression table + notes
    const rt = el('div', { class: 'gs-note' });
    rt.innerHTML = `<b>Per-flight simple linear regression (descent only, proposal §C):</b> ` + Object.values(r.regress).map((g2) => `${g2.label}: ${isFinite(g2.slope100) ? U.fmtSig(g2.slope100) : '—'} /100 m (R² ${isFinite(g2.r2) ? g2.r2.toFixed(2) : '—'})`).join(' · ') +
      `<br><b>Environment:</b> ${r.env.source === 'open-meteo' ? 'Open-Meteo forecast' : 'climatology'} · T ${r.env.T2.toFixed(1)} °C, RH ${r.env.RH2.toFixed(0)} %, P ${r.env.Ps.toFixed(1)} hPa · Pasquill ${r.env.cls} · background ${U.esc(r.env.aqSource)}` +
      (r.env.regionalInfo.length ? ` · regional plume: ${U.esc(r.env.regionalInfo.join('; '))}` : ' · <i>no dispersion run covers this time — regional volcanic contribution is zero</i>') +
      `<br><b>Things the simulator shows:</b> the MH-Z19B barely responds in a ${r.descentTime.toFixed(0)} s descent (t90 ≈ 120 s); the MQ-136 cannot see ambient H₂S below 1 ppm; humid air inflates PMS5003 readings; and the standard barometric formula under-reads AGL by about ${((1 - (288.15 / (r.env.T2 + 273.15))) * 100).toFixed(0)} % at ${r.env.T2.toFixed(0)} °C. Report these as the "indicative" limitations the proposal anticipates.`;
    pane.appendChild(rt);
  }
  function gsConsole(pane) {
    pane.innerHTML = '';
    const r = S.cs;
    const bar = el('div', { class: 'at-top' }, [
      el('button', { class: 'btn small', text: 'Save ground log (CSV)', onclick: () => X.exportCSV('ground') }),
      el('button', { class: 'btn small', text: 'Save microSD log (CSV)', onclick: () => X.exportCSV('sd') }),
      el('button', { class: 'btn small', text: 'Attribute table', onclick: () => X.attributeTable('sd') }),
      el('span', { class: 'muted', text: `Frame: AERIS,seq,MET,lat,lon,alt_baro,alt_gps,SO2_ppm,H2S_ppm,CO2_ppm,PM2.5,PM10,T_C,RH,P_hPa,Vbat,flags*CRC16` })
    ]);
    const con = el('div', { class: 'console', style: { height: 'calc(100% - 34px)' } });
    con.innerHTML = `<span class="hdr"># AERIS ground station — LoRa 433 MHz, 1 Hz — ${U.fmtPHT(S.cfg.flightTime, true)}</span>\n` +
      r.recs.map((p) => p.rx ? `[${String(p.met).padStart(3, '0')}s ${p.phase.padEnd(7)}] RX  ${U.esc(p.line)}  CRC OK  d=${p.dist.toFixed(0)}m`
        : `<span class="drop">[${String(p.met).padStart(3, '0')}s ${p.phase.padEnd(7)}] --  packet #${p.seq} lost (P_rx=${p.pRx.toFixed(3)}) → recovered from microSD</span>`).join('\n');
    pane.style.display = 'flex'; pane.style.flexDirection = 'column';
    pane.append(bar, con);
  }
  function gsGng(pane) {
    pane.innerHTML = '';
    const g = S.gng;
    const t = el('table', { class: 'gng' });
    g.checks.forEach((c) => t.appendChild(el('tr', {}, [
      el('td', { class: 'st', html: c.ok ? (c.warn ? '<span style="color:#b26a00">!</span>' : '<span style="color:#2e7d32">✓</span>') : '<span style="color:#c62828">✗</span>' }),
      el('td', { text: c.item }), el('td', { class: 'mono', text: c.value })])));
    const wrap = el('div', { class: 'pad' }, [el('div', { html: `<b>Pre-flight go/no-go (proposal D.8)</b> — ${U.fmtPHT(S.cfg.flightTime, true)} · verdict <span class="pill ${g.verdict === 'GO' ? 'go' : g.verdict === 'NO-GO' ? 'nogo' : 'caution'}">${g.verdict}</span>`, style: { marginBottom: '6px' } }), t]);
    pane.appendChild(wrap);
    // flight-window calendar: every day of the loaded period × 24 PHT hours
    const cal = A.flightCalendar();
    if (!cal) return;
    pane.appendChild(el('div', { class: 'pad', style: { paddingBottom: '4px' }, html: `<b>Flight-window calendar</b> — ${U.esc(MET.periodLabel())} (PHT). Click any hour to set the flight time and re-simulate. Faded cells are night hours (no visual-line-of-sight flights). <a href="#" id="calPeriod">Change dates…</a>` }));
    const tbl = el('table', { class: 'fw-cal' });
    const head = el('tr', {}, [el('th', { text: '' })]);
    for (let h = 0; h < 24; h++) head.appendChild(el('th', { text: String(h).padStart(2, '0') }));
    tbl.appendChild(head);
    cal.days.forEach((d) => {
      const tr = el('tr', {}, [el('th', { class: 'd', text: A.dayLabel(d.key) })]);
      d.hours.forEach((c) => {
        if (!c) { tr.appendChild(el('td', { class: 'na' })); return; }
        const sel = Math.abs(c.t - S.cfg.flightTime) < 1800e3;
        const td = el('td', { class: `${c.v === 'GO' ? 'go' : c.v === 'CAUTION' ? 'caution' : 'nogo'}${c.day ? '' : ' night'}${sel ? ' sel' : ''}`,
          title: `${U.fmtPHT(c.t, true)} · ${c.v} · wind @${S.cfg.releaseAGL} m ${c.ws.toFixed(1)} m/s · rain ${(c.rain || 0).toFixed(1)} mm/h${c.fail ? ' · fails: ' + c.fail : ''}`,
          text: c.ws.toFixed(0) });
        td.addEventListener('click', () => { S.cfg.flightTime = c.t; X.runCansat(); });
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    pane.appendChild(el('div', { class: 'pad', style: { paddingTop: 0, overflowX: 'auto' } }, [tbl,
      el('div', { class: 'muted', style: { marginTop: '6px', fontSize: '11px' }, html: '<span class="fw-sw go"></span> GO <span class="fw-sw caution"></span> CAUTION <span class="fw-sw nogo"></span> NO-GO · number = wind speed at release altitude (m/s) · outlined = current flight' })]));
    const lk = pane.querySelector('#calPeriod'); if (lk) lk.addEventListener('click', (e) => { e.preventDefault(); X.periodDialog(); });
  }
  function gsCampaign(pane) {
    pane.innerHTML = '';
    pane.appendChild(el('div', { class: 'pad' }, [
      el('div', { html: '<b>Six-flight field campaign (proposal D.9)</b> — six flights on the flight date at 07, 09, 11, 13, 15 and 17 PHT, each checked against the go/no-go criteria.', style: { marginBottom: '6px' } }),
      el('button', { class: 'btn', text: S.campaign ? 'Re-run campaign' : 'Run campaign', onclick: () => X.campaignRun() })
    ]));
    if (!S.campaign) return;
    const host = el('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '200px' } });
    pane.appendChild(host);
    UI.table(host, { columns: CAMPAIGN_COLS, rows: S.campaign });
  }
  const CAMPAIGN_COLS = [
    { key: 'flight', label: 'Flight', num: true }, { key: 'time', label: 'Release (PHT)' },
    { key: 'verdict', label: 'Go/No-Go', cls: (r) => (r.verdict === 'GO' ? 'good' : r.verdict === 'NO-GO' ? 'bad' : 'warn') },
    { key: 'ws', label: 'Wind @ release (m/s)', num: true, fmt: (v) => v.toFixed(1) }, { key: 'rate', label: 'Descent (m/s)', num: true, fmt: (v) => v.toFixed(2) },
    { key: 'dtime', label: 'Descent time (s)', num: true, fmt: (v) => v.toFixed(1) }, { key: 'samples', label: 'Samples', num: true },
    { key: 'pdr', label: 'PDR (%)', num: true, fmt: (v) => v.toFixed(1) }, { key: 'gaps', label: 'Gaps > 3 s', num: true },
    { key: 'land', label: 'Landing (m)', num: true, fmt: (v) => v.toFixed(0) }, { key: 'brg', label: 'Bearing', fmt: (v) => `${v.toFixed(0)}° ${U.compass(v)}` },
    { key: 'so2', label: 'Max SO₂ (ppb)', num: true, fmt: (v) => v.toFixed(0) }, { key: 'rmse', label: 'Baro RMSE (m)', num: true, fmt: (v) => v.toFixed(2) }
  ];
  X.campaignRun = async function () {
    if (!S.cfg.flightTime) S.cfg.flightTime = defaultFlightTime();
    A.busy('Six-flight campaign…');
    try {
      await X.loadPoint();
      const cfg = csCfg();
      const d = new Date(S.cfg.flightTime + 8 * 3600e3);
      const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3600e3;
      S.campaign = [7, 9, 11, 13, 15, 17].map((h, i) => {
        const t = base + h * 3600e3;
        const env = CS.buildEnv(S.point, t, cfg, S.results);
        if (S.cfg.autoCanopy !== false) cfg.canopyD = CS.canopyForSpeed(cfg.mass, cfg.cd, CS.airDensity(env.Ps, env.T2, env.RH2), cfg.targetV);
        const r = CS.simulate(cfg, env, 100 + i);
        const g = CS.goNoGo(cfg, env, siteSO2ppb(t));
        return { flight: i + 1, time: U.fmtPHT(t, true), t, verdict: g.verdict, ws: g.wsRel, rate: r.stats.descentRate, dtime: r.descentTime, samples: r.stats.descentSamples,
          pdr: r.stats.pdr * 100, gaps: r.stats.gaps3s, land: r.landing.dist, brg: r.landing.brg, so2: r.stats.maxSO2, rmse: r.stats.altRmseBaro };
      });
      const go = S.campaign.filter((r) => r.verdict !== 'NO-GO').length;
      UI.message('Campaign', `${go} of 6 flights meet the go/no-go criteria on ${U.fmtPHT(base + 9 * 3600e3, true).slice(0, 10)}.`, go === 6 ? 'ok' : 'warn', 8000, { label: 'Open table', run: () => X.attributeTable('campaign') });
      const gw = UI.getWindow('gs');
      if (gw && gw.refresh) { gw.refresh(); gw.tabs.select('camp'); } else { X.groundStation(); setTimeout(() => { const w2 = UI.getWindow('gs'); if (w2) w2.tabs.select('camp'); }, 50); }
    } finally { A.busy(null); }
  };

  X.parachuteCalc = function () {
    UI.window({ id: 'chute', title: 'Parachute Sizing Calculator', icon: 'cansat', width: 560, height: 520, content: (body) => {
      const pad = el('div', { class: 'pad', style: { background: 'var(--panel)', flex: '1' } });
      const env = S.cs ? S.cs.env : { T2: 30, Ps: 960, RH2: 75 };
      const f = UI.form([
        { type: 'number', key: 'm', label: 'Payload mass m (kg)', value: S.cfg.mass, step: 0.01 },
        { type: 'number', key: 'cd', label: 'Drag coefficient C<sub>d</sub> (hemispherical ≈ 1.5)', value: S.cfg.cd, step: 0.05 },
        { type: 'number', key: 'v', label: 'Target descent rate v (m/s)', value: S.cfg.targetV, step: 0.1 },
        { type: 'number', key: 'T', label: 'Air temperature (°C)', value: +env.T2.toFixed(1), step: 0.5 },
        { type: 'number', key: 'P', label: 'Station pressure (hPa)', value: +env.Ps.toFixed(1), step: 1 },
        { type: 'number', key: 'RH', label: 'Relative humidity (%)', value: +env.RH2.toFixed(0), step: 1 }
      ]);
      const out = el('div', { class: 'doc', style: { padding: '8px 0' } });
      const calc = () => {
        const v = f.values();
        const rho = CS.airDensity(v.P, v.T, v.RH);
        const d = CS.canopyForSpeed(v.m, v.cd, rho, v.v);
        const area = Math.PI * d * d / 4;
        const rows = [['Required for target', d], ['Proposal Table 5 (1.0 m nylon)', 1.0], ['Proposal D.4 (34 cm hemispherical)', 0.34], ['Sea-level design (ρ = 1.225)', CS.canopyForSpeed(v.m, v.cd, 1.225, v.v)]];
        out.innerHTML = `<div class="eq">A = 2·m·g / (ρ·C<sub>d</sub>·v²)   ρ = ${rho.toFixed(4)} kg/m³ (site)   →   A = ${area.toFixed(4)} m²,  D = ${d.toFixed(3)} m</div>
          <table><tr><th>Canopy</th><th>Diameter (m)</th><th>Descent rate (m/s)</th><th>Time from ${S.cfg.releaseAGL} m (s)</th><th>Samples @1 Hz</th></tr>
          ${rows.map(([n, dd]) => { const vt = CS.terminalVelocity(v.m, v.cd, rho, dd); return `<tr><td>${n}</td><td>${dd.toFixed(3)}</td><td>${vt.toFixed(2)}</td><td>${(S.cfg.releaseAGL / vt).toFixed(1)}</td><td>${Math.floor(S.cfg.releaseAGL / vt)}</td></tr>`; }).join('')}</table>
          <div class="warnbox">The proposal lists two canopy sizes (1.0 m and 34 cm) and two sample counts (≈25 and ≈50). At 4.0 m/s a 100 m drop lasts 25 s, giving 25 samples; 50 samples needs about 2 m/s. Hot, humid, low-pressure site air speeds up the descent compared with sea-level design values.</div>`;
      };
      f.el.addEventListener('input', calc);
      pad.append(f.el, out);
      body.appendChild(pad);
      calc();
    } });
  };

  /* ============================== attribute table ============================== */
  const AT_LAYERS = {
    sd: { name: 'CanSat telemetry — microSD log (authoritative)', rows: () => (S.cs ? S.cs.recs : []), cols: () => TEL_COLS.concat([{ key: 'rx', label: 'LoRa RX', fmt: (v) => (v ? 'yes' : 'no'), cls: (r) => (r.rx ? '' : 'bad') }]) },
    ground: { name: 'CanSat telemetry — ground-station log (received)', rows: () => (S.cs ? S.cs.recs.filter((r) => r.rx) : []), cols: () => TEL_COLS },
    receptors: { name: 'Receptor exposure (active run)', rows: receptorRows, cols: () => REC_COLS() },
    volcanoes: { name: 'PHIVOLCS volcanoes', rows: () => D.volcanoes.map((v) => ({ ...v, dist: U.haversine(v.lat, v.lon, S.cfg.site.lat, S.cfg.site.lon) / 1000, rate: srcFromVolcano(v, S.species).rate })), cols: () => VOLC_COLS },
    attribution: { name: 'Source attribution (backward trajectories)', rows: () => S.attribution || [], cols: () => ATTR_COLS },
    trajpts: { name: 'Trajectory points (forward + backward)', rows: trajRows, cols: () => TRAJ_COLS },
    campaign: { name: 'Six-flight campaign summary', rows: () => S.campaign || [], cols: () => CAMPAIGN_COLS }
  };
  const TEL_COLS = [
    { key: 'seq', label: 'seq', num: true }, { key: 'met', label: 'MET_s', num: true }, { key: 'phase', label: 'phase' },
    { key: 'lat', label: 'lat', num: true, fmt: (v) => v.toFixed(6) }, { key: 'lon', label: 'lon', num: true, fmt: (v) => v.toFixed(6) },
    { key: 'altBaro', label: 'alt_baro_m', num: true, fmt: (v) => v.toFixed(1) }, { key: 'altGps', label: 'alt_gps_m', num: true, fmt: (v) => v.toFixed(1) },
    { key: 'so2', label: 'SO2_ppm', num: true, fmt: (v) => v.toFixed(3) }, { key: 'h2s', label: 'H2S_ppm', num: true, fmt: (v, r) => v.toFixed(2) + (r.h2sLOD ? ' <LOD' : '') },
    { key: 'co2', label: 'CO2_ppm', num: true }, { key: 'pm25', label: 'PM2.5', num: true }, { key: 'pm10', label: 'PM10', num: true },
    { key: 'T', label: 'T_C', num: true, fmt: (v) => v.toFixed(2) }, { key: 'RH', label: 'RH_pct', num: true, fmt: (v) => v.toFixed(1) }, { key: 'P', label: 'P_hPa', num: true, fmt: (v) => v.toFixed(2) },
    { key: 'vbat', label: 'Vbat', num: true, fmt: (v) => v.toFixed(2) }, { key: 'flags', label: 'flags' }, { key: 'crc', label: 'CRC16' }
  ];
  const REC_COLS = () => {
    const R = A.activeResult(), spId = R ? R.species : S.species, u = S.style.units === 'ug' ? 'µg/m³' : D.mixUnit(spId);
    const s = D.species[spId];
    return [{ key: 'name', label: 'town' }, { key: 'lat', label: 'lat', num: true, fmt: (v) => v.toFixed(4) }, { key: 'lon', label: 'lon', num: true, fmt: (v) => v.toFixed(4) },
      { key: 'cur', label: `now (${u})`, num: true, fmt: (v) => (v === null ? null : U.fmtSig(conv(spId, v))) },
      { key: 'max', label: `run max (${u})`, num: true, fmt: (v) => U.fmtSig(conv(spId, v)), cls: (r) => (r.max >= s.classes[3] ? 'bad' : r.max >= s.classes[2] ? 'warn' : '') },
      { key: 'tMax', label: 'time of max (PHT)', fmt: (v) => (v ? U.fmtPHT(v, true) : null) },
      { key: 'arrival', label: 'arrival (+h)', num: true }, { key: 'dist', label: 'km to nearest source', num: true, fmt: (v) => v.toFixed(0) },
      { key: 'note', label: 'guideline exceeded (1-h, indicative)' }];
  };
  const conv = (spId, ug) => (S.style.units === 'ug' ? ug : D.toMixing(spId, ug));
  function receptorRows() {
    const R = A.activeResult();
    if (!R) return [];
    const s = D.species[R.species];
    return R.receptors.map((r) => ({ ...r, cur: r.series[S.ti], dist: Math.min(...R.sources.map((x) => U.haversine(r.lat, r.lon, x.lat, x.lon))) / 1000,
      note: s.classes.filter((k) => s.notes[k] && r.max >= k).map((k) => s.notes[k]).join('; ') || '' })).sort((a, b) => b.max - a.max);
  }
  const VOLC_COLS = [{ key: 'name', label: 'name' }, { key: 'status', label: 'PHIVOLCS status' }, { key: 'prov', label: 'province' },
    { key: 'lat', label: 'lat', num: true, fmt: (v) => v.toFixed(4) }, { key: 'lon', label: 'lon', num: true, fmt: (v) => v.toFixed(4) }, { key: 'elev', label: 'elev_m', num: true },
    { key: 'rate', label: 'scenario rate (t/d, current pollutant)', num: true }, { key: 'rise', label: 'plume rise (m)', num: true }, { key: 'dist', label: 'km to CanSat site', num: true, fmt: (v) => v.toFixed(1) }];
  const ATTR_COLS = [{ key: 'height', label: 'arrival height (m AGL)', num: true }, { key: 'volcano', label: 'volcano' }, { key: 'distKm', label: 'closest approach (km)', num: true, fmt: (v) => v.toFixed(1) },
    { key: 'hoursBefore', label: 'hours before arrival', num: true, fmt: (v) => v.toFixed(1) }, { key: 'zMSL', label: 'parcel height (m MSL)', num: true, fmt: (v) => v.toFixed(0) },
    { key: 'ventElev', label: 'vent (m MSL)', num: true },
    { key: 'verdict', label: 'interpretation', fmt: (v, r) => (r.distKm < 10 && r.zMSL < r.ventElev + 800 ? 'parcel crossed the vent area near plume height → volcanic signal plausible' : r.distKm < 25 ? 'passed nearby → weak/possible signal' : '') }];
  function trajRows() {
    const out = [];
    [...(S.traj || []), ...(S.back || [])].forEach((t) => t.pts.forEach((p, i) => {
      if (i % 6 !== 0) return;
      out.push({ origin: t.origin, dir: t.dir > 0 ? 'forward' : 'backward', height: t.height, hour: (p.t - t.pts[0].t) / 3600e3, time: U.fmtPHT(p.t, true), lat: p.lat, lon: p.lon, zAGL: p.zAGL, zMSL: p.zMSL, pblh: p.pblh });
    }));
    return out;
  }
  const TRAJ_COLS = [{ key: 'origin', label: 'origin' }, { key: 'dir', label: 'direction' }, { key: 'height', label: 'start height (m)', num: true }, { key: 'hour', label: 'hour', num: true },
    { key: 'time', label: 'time (PHT)' }, { key: 'lat', label: 'lat', num: true, fmt: (v) => v.toFixed(4) }, { key: 'lon', label: 'lon', num: true, fmt: (v) => v.toFixed(4) },
    { key: 'zAGL', label: 'height AGL (m)', num: true, fmt: (v) => v.toFixed(0) }, { key: 'zMSL', label: 'height MSL (m)', num: true, fmt: (v) => v.toFixed(0) }, { key: 'pblh', label: 'PBL (m)', num: true, fmt: (v) => (isFinite(v) ? v.toFixed(0) : null) }];

  X.attributeTable = function (key) {
    key = key || ({ 'cs-track': 'sd', receptors: 'receptors', volcanoes: 'volcanoes', back: 'attribution', traj: 'trajpts' }[A.selectedLayer()]) || (S.cs ? 'sd' : 'receptors');
    const existing = UI.getWindow('attr');
    if (existing) { existing.show(key); existing.focus(); return; }
    UI.window({ id: 'attr', title: 'Attribute Table', icon: 'table', width: Math.min(1100, window.innerWidth - 40), height: 480, y: window.innerHeight - 520,
      onClose: () => { if (S.hl) S.hl.remove(); },
      content: (body, api) => {
        const top = el('div', { class: 'at-top' });
        const sel = el('select');
        Object.entries(AT_LAYERS).forEach(([k, v]) => sel.appendChild(el('option', { value: k, text: v.name })));
        const host = el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: 0 } });
        const foot = el('div', { class: 'at-foot' });
        top.append(el('span', { html: UI.icon('table', 'width="16" height="16"') }), sel,
          el('button', { class: 'btn small', text: 'Export CSV', onclick: () => { const L2 = AT_LAYERS[sel.value]; U.download(`aeris_${sel.value}.csv`, U.toCSV(L2.rows(), L2.cols().map((c) => ({ key: c.key, label: c.label, csv: (r) => r[c.key] }))), 'text/csv'); } }),
          el('button', { class: 'btn small', text: 'Refresh', onclick: () => api.show(sel.value) }));
        body.append(top, host, foot);
        api.show = (k) => {
          sel.value = k;
          const L2 = AT_LAYERS[k];
          const rows = L2.rows();
          host.innerHTML = '';
          api.setTitle(`Attribute Table — ${L2.name} — Features Total: ${rows.length}`);
          UI.table(host, { columns: L2.cols(), rows, onSelect: (r) => highlight(r) });
          foot.innerHTML = `<span>Show All Features</span><span class="muted">·</span><span>Features: ${rows.length}, filtered: ${rows.length}, selected: 0</span>`;
          if (!rows.length) host.appendChild(el('div', { class: 'pad muted', text: 'No features — run the corresponding model first.' }));
        };
        sel.addEventListener('change', () => api.show(sel.value));
        api.show(key);
      } });
  };
  function highlight(r) {
    if (S.hl) S.hl.remove();
    const lat = r.tlat !== undefined ? r.tlat : r.lat, lon = r.tlon !== undefined ? r.tlon : r.lon;
    if (!isFinite(lat) || !isFinite(lon)) return;
    S.hl = L.circleMarker([lat, lon], { radius: 9, color: '#ffea00', weight: 3, fill: false, pane: 'measure' }).addTo(S.map);
    if (!S.map.getBounds().contains([lat, lon])) S.map.panTo([lat, lon]);
  }

  /* ============================== exports ============================== */
  const fc = (features) => ({ type: 'FeatureCollection', features });
  const pt = (lon, lat, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [+lon.toFixed(6), +lat.toFixed(6)] }, properties: props });
  const dl = (name, obj) => U.download(name, JSON.stringify(obj), 'application/geo+json');
  function contourFeatures(max, layer) {
    const R = A.activeResult();
    const s = D.species[R.species];
    const arr = max ? R.maxConc : R.frames[S.ti].conc;
    const g = ML.contours(R.grid, arr, s.classes);
    g.features.forEach((f) => {
      f.properties = { layer: layer || 'contours', species: R.species, level_ugm3: f.properties.level, [`level_${D.mixUnit(R.species)}`]: +D.toMixing(R.species, f.properties.level).toFixed(3),
        guideline: s.notes[f.properties.level] || '', valid_utc: max ? 'run maximum' : new Date(R.frames[S.ti].t).toISOString(), layer_top_m: R.params.layerTop };
    });
    return g.features;
  }
  X.exportContours = (max) => { if (A.activeResult()) dl(`aeris_${A.activeResult().species}_${max ? 'max' : 'conc_' + new Date(A.currentTime()).toISOString().slice(0, 13).replace(/[-T:]/g, '')}.geojson`, fc(contourFeatures(max))); };
  function particleFeatures() {
    const R = A.activeResult(), sn = R.snaps[S.ti], out = [];
    for (let i = 0; i < sn.lat.length; i++) out.push(pt(sn.lon[i], sn.lat[i], { layer: 'particles', height_agl_m: +sn.z[i].toFixed(0), age_h: +sn.age[i].toFixed(2), source: R.sources[sn.src[i]].name }));
    return out;
  }
  X.exportParticles = () => { if (A.activeResult()) dl('aeris_particles.geojson', fc(particleFeatures())); };
  function trajFeatures() {
    return [...(S.traj || []), ...(S.back || [])].map((t) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: t.pts.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]) },
      properties: { layer: t.dir > 0 ? 'forward_trajectory' : 'backward_trajectory', origin: t.origin, start_height_m: t.height, start_utc: new Date(t.pts[0].t).toISOString(), end_utc: new Date(t.pts[t.pts.length - 1].t).toISOString() } }));
  }
  X.exportTraj = () => dl('aeris_trajectories.geojson', fc(trajFeatures()));
  function cansatFeatures() {
    if (!S.cs) return [];
    const r = S.cs;
    const f = r.recs.map((p) => pt(p.tlon, p.tlat, { layer: 'cansat_packets', seq: p.seq, met_s: p.met, phase: p.phase, alt_true_m: +p.altTrue.toFixed(2), alt_baro_m: +p.altBaro.toFixed(2), alt_gps_m: +p.altGps.toFixed(2),
      so2_ppm: p.so2, h2s_ppm: p.h2s, co2_ppm: p.co2, pm25: p.pm25, pm10: p.pm10, t_c: p.T, rh_pct: p.RH, p_hpa: p.P, vbat: p.vbat, lora_rx: p.rx, crc16: p.crc }));
    const ring = (ll) => { const c = ll.map(([la, lo]) => [+lo.toFixed(6), +la.toFixed(6)]); c.push(c[0]); return [c]; };
    f.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: ring(S.mc.ellipseLL) }, properties: { layer: 'landing_ellipse_95', semi_major_m: +S.mc.a.toFixed(1), semi_minor_m: +S.mc.b.toFixed(1) } });
    f.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: ring(S.mc.exclusionLL) }, properties: { layer: 'exclusion_zone', buffer_m: S.cfg.exclusion } });
    f.push(pt(r.landing.lon, r.landing.lat, { layer: 'predicted_landing', dist_m: +r.landing.dist.toFixed(1), bearing_deg: +r.landing.brg.toFixed(1) }));
    f.push(pt(S.cfg.site.lon, S.cfg.site.lat, { layer: 'launch_site' }), pt(S.cfg.gs.lon, S.cfg.gs.lat, { layer: 'ground_station' }), pt(S.cfg.vent.lon, S.cfg.vent.lat, { layer: 'hot_spring_vent' }));
    return f;
  }
  X.exportCansatGeo = () => dl('aeris_cansat.geojson', fc(cansatFeatures()));
  function pointFeatures() {
    return D.volcanoes.map((v) => pt(v.lon, v.lat, { layer: 'volcanoes', name: v.name, status: v.status, province: v.prov, elev_m: v.elev, priority: !!v.priority, so2_tpd_scenario: v.emis.SO2 }))
      .concat(D.receptors.map((r) => pt(r.lon, r.lat, { layer: 'receptors', name: r.name })));
  }
  X.exportPoints = () => dl('aeris_volcanoes_receptors.geojson', fc(pointFeatures()));
  X.exportAll = function () {
    const f = pointFeatures().concat(trajFeatures(), cansatFeatures());
    if (A.activeResult()) f.push(...contourFeatures(false, 'contours_current'), ...contourFeatures(true, 'contours_max'));
    dl('aeris_project.geojson', fc(f));
    UI.message('Export', 'Saved <b>aeris_project.geojson</b>. In QGIS: Layer ▸ Add Layer ▸ Add Vector Layer, then Vector ▸ Data Management Tools ▸ Split Vector Layer on the <code>layer</code> field.', 'ok', 10000);
  };
  X.exportCSV = function (kind) {
    if (kind === 'receptors') {
      const R = A.activeResult(); if (!R) return;
      const cols = [{ key: 'name', label: 'town' }, { key: 'lat' }, { key: 'lon' }].concat(R.frames.map((f, i) => ({ key: 'h' + i, label: new Date(f.t).toISOString().slice(0, 16) + 'Z', csv: (r) => (r.series[i] === null ? '' : +r.series[i].toFixed(3)) })));
      U.download(`aeris_receptors_${R.species}_ugm3.csv`, U.toCSV(R.receptors, cols), 'text/csv');
      return;
    }
    if (!S.cs) return;
    const rows = kind === 'ground' ? S.cs.recs.filter((r) => r.rx) : S.cs.recs;
    const cols = TEL_COLS.map((c) => ({ key: c.key, label: c.label })).concat([{ key: 'rx', label: 'lora_rx' }, { key: 'line', label: 'raw_frame' }]);
    U.download(`aeris_${kind === 'ground' ? 'ground_station' : 'microsd'}_log.csv`, U.toCSV(rows, cols), 'text/csv');
  };

  /* HYSPLIT CONTROL / SETUP.CFG so the same case can be re-run in official HYSPLIT */
  X.exportHysplit = function () {
    const R = A.activeResult();
    const p = R ? R.params : (MET.ready ? defaultParams(['apo', 'leonard'], S.species, 24) : null);
    if (!p) return;
    const s = D.species[p.species];
    const srcs = (R ? R.sources : p.sources).filter((x) => x.rate > 0);
    const grid = R ? R.grid : { latN: 9, ny: 400, nx: 400, res: 0.01, lon0: 124 };
    const cLat = grid.latN - grid.ny * grid.res / 2, cLon = grid.lon0 + grid.nx * grid.res / 2;
    const hd = (ms) => U.hysplitDate(ms);
    const locs = [];
    srcs.forEach((x) => { const kgph = x.rate * 1000 / 24; locs.push(`${x.lat.toFixed(4)} ${x.lon.toFixed(4)} ${x.ventMSL.toFixed(1)} ${(kgph / 2).toFixed(3)} 0.0 0.0`, `${x.lat.toFixed(4)} ${x.lon.toFixed(4)} ${(x.ventMSL + x.rise).toFixed(1)} ${(kgph / 2).toFixed(3)} 0.0 0.0`); });
    const halfLife = s.kchem > 0 ? (Math.log(2) / (s.kchem / 100) / 24) : 0;
    const henry = { SO2: '1.24 0.0 3.0E-05', H2S: '0.1 0.0 4.0E-06', CO2: '0.0 0.0 0.0' }[p.species];
    const control = [
      `${hd(p.startMs)}                 # start time (UTC) — ${U.fmtPHT(p.startMs, true)}`,
      `${locs.length}                           # number of starting locations (pairs = vertical line sources)`,
      ...locs.map((l, i) => `${l}   # ${srcs[Math.floor(i / 2)].name} ${i % 2 ? 'plume top' : 'vent'} (m MSL, kg/h)`),
      `${p.hours}                          # total run time (h)`,
      `0                           # vertical motion: data`,
      `10000.0                     # top of model domain (m AGL)`,
      `1                           # number of meteorological files`,
      `./                          # met directory`,
      `${new Date(p.startMs).toISOString().slice(0, 10).replace(/-/g, '')}_gfs0p25          # GFS 0.25° ARL file (ftp.arl.noaa.gov/archives/gfs0p25/)`,
      `1                           # number of pollutants`,
      `${p.species.padEnd(4, ' ')}                        # pollutant id`,
      `${(srcs.reduce((a, x) => a + x.rate, 0) * 1000 / 24).toFixed(3)}                   # emission rate (kg/h) — overridden per location above`,
      `${p.releaseHours.toFixed(1)}                        # hours of emission`,
      `${hd(p.startMs)} 00              # release start`,
      `1                           # number of concentration grids`,
      `${cLat.toFixed(3)} ${cLon.toFixed(3)}             # grid centre (lat lon)`,
      `${grid.res} ${grid.res}                   # grid spacing (deg)`,
      `${(grid.ny * grid.res).toFixed(2)} ${(grid.nx * grid.res).toFixed(2)}                 # grid span (deg)`,
      `./                          # output directory`,
      `cdump_${p.species.toLowerCase()}                 # output file`,
      `2                           # number of vertical levels`,
      `0 ${p.layerTop}                       # level tops (m AGL): 0 = deposition, ${p.layerTop} = CanSat layer`,
      `${hd(p.startMs)} 00              # sampling start`,
      `00 00 00 00 00              # sampling stop (0 = end of run)`,
      `0 1 0                       # 1-h averages`,
      `1                           # number of depositing pollutants`,
      `0.0 0.0 0.0                 # gas: diameter, density, shape = 0`,
      `${s.vd.toFixed(4)} ${s.mw.toFixed(1)} 0.0 0.0 0.0     # dry dep velocity (m/s), MW, reactivity, diffusivity, eff. Henry`,
      `${henry}           # wet removal: Henry (M/atm), in-cloud (L/L), below-cloud (1/s)`,
      `${halfLife.toFixed(2)}                        # first-order loss as half-life (days) — ${s.kchem} %/h chemistry`,
      `0.0                         # resuspension`
    ].join('\n');
    const setup = [' &SETUP', ` initd = 3,          ! Gaussian-horizontal puff / particle-vertical (matches AERIS hybrid)`,
      ` kmsl = 1,           ! starting heights are metres above mean sea level (volcano vents)`,
      ` numpar = ${p.nPart},`, ` maxpar = ${Math.max(20000, p.nPart * 3)},`, ` delt = ${p.dtMin}.0,`, ' kmixd = 0,          ! mixed layer depth from met data (GFS HPBL)',
      ' kbls = 1,', ' kblt = 2,', ' ichem = 0,', ' conage = 48,', ' cpack = 1,', ' /'].join('\n');
    UI.window({ id: 'hysplit', title: 'HYSPLIT CONTROL + SETUP.CFG', icon: 'save', width: 820, height: 640, content: (body) => {
      const t = UI.tabs(body, [{ id: 'c', label: 'CONTROL' }, { id: 's', label: 'SETUP.CFG' }, { id: 'h', label: 'How to run' }]);
      const ta = (txt) => { const a = el('textarea', { class: 'mono', spellcheck: 'false', style: { width: '100%', height: '100%', border: 0, padding: '8px', background: 'var(--panel)', color: 'var(--text)', resize: 'none', fontSize: '11.5px' } }); a.value = txt; return a; };
      t.panes.c.appendChild(ta(control)); t.panes.s.appendChild(ta(setup));
      t.panes.h.innerHTML = `<div class="doc"><h2>Validate against official HYSPLIT</h2><ol>
        <li>Install HYSPLIT (free desktop version from NOAA ARL) or use the READY web interface.</li>
        <li>Download the GFS 0.25° ARL file for the start date from <code>ftp.arl.noaa.gov/archives/gfs0p25/</code> (or <code>forecast/</code> for current runs) into the working folder.</li>
        <li>Click <b>Save CONTROL</b> and <b>Save SETUP.CFG</b> (the saved files have the annotations stripped, since HYSPLIT reads text lines verbatim), put them in the working folder and run <code>hycs_std</code>.</li>
        <li>Convert <code>cdump</code> with <code>con2asc</code> or <code>concplot</code> and compare with <i>Project ▸ Export ▸ contours</i> in QGIS.</li></ol>
        <p>Each volcano becomes two starting locations (vent and plume top), which HYSPLIT treats as a vertical line source. Chemistry is expressed as an equivalent first-order half-life.</p></div>`;
      const foot = el('div', { class: 'win-foot' }, [el('span', { class: 'spacer' }),
        el('button', { class: 'btn', text: 'Save CONTROL', onclick: () => U.download('CONTROL', control.split('\n').map((l) => l.replace(/\s+#.*$/, '')).join('\n') + '\n') }),
        el('button', { class: 'btn', text: 'Save SETUP.CFG', onclick: () => U.download('SETUP.CFG', setup.split('\n').map((l) => l.replace(/\s+!.*$/, '')).join('\n') + '\n') })]);
      body.appendChild(foot);
    } });
  };

  /* ============================== misc windows ============================== */
  X.clearOutputs = function () {
    S.results = {}; S.activeSpecies = null; S.traj = null; S.back = null; S.attribution = []; S.cs = null; S.mc = null; S.gng = null; S.campaign = null;
    ['traj', 'back', 'cs-track', 'cs-mc', 'cs-excl', 'cs-local', 'maxconc', 'arrival'].forEach((k) => S.lg[k].clearLayers());
    A.renderCansatPoints(); A.buildTimeline(); A.renderTime(); A.renderTree(); A.renderLegendDeco(); A.renderRight();
    UI.message('Cleared', 'All model output removed.', 'info', 4000);
  };
  X.reloadMet = async function (model) {
    A.busy('Reloading meteorology…');
    try {
      await MET.load({ model: model || MET.model, noCache: true, onMsg: (m) => A.busy(m) });
      const sel = document.getElementById('tbModel'); if (sel) sel.value = MET.model;
      S.point = null;
      updatePeriodLabel();
      A.buildTimeline(); A.renderTime(); A.renderRight();
      if (MET.source === 'open-meteo') UI.message('Meteorology', `Loaded ${U.esc(MET.describe())}`, 'ok', 8000, { label: 'Re-run priority volcanoes', run: () => X.runQuick(['apo', 'leonard'], { species: S.species }) });
      else UI.message('Offline', 'Open-Meteo could not be reached; using climatology (not a forecast).', 'warn', 0);
    } finally { A.busy(null); }
  };
  X.logWindow = function () {
    UI.window({ id: 'logwin', title: 'Log Messages', icon: 'log', width: 720, height: 360, content: (body, api) => {
      const box = el('div', { class: 'algo-log', style: { flex: 1, overflow: 'auto' } });
      body.appendChild(box);
      api.append = (e) => { box.appendChild(el('div', { class: e.level === 'warn' ? 'lg-warn' : e.level === 'err' ? 'lg-err' : e.level === 'ok' ? 'lg-ok' : '', text: `${e.t.toISOString().slice(11, 19)}  [${e.tab}]  ${e.msg}` })); box.scrollTop = box.scrollHeight; };
      UI.logs.forEach(api.append);
    } });
  };
  X.measureWindow = function () {
    const m = S.measure;
    let w = UI.getWindow('measure');
    if (!w) w = UI.window({ id: 'measure', title: 'Measure', icon: 'measure', width: 360, height: 300, x: window.innerWidth - 400, y: 120,
      onClose: () => { A.clearMeasure(); A.setTool('pan'); },
      content: (body, api) => {
        api.box = el('div', { class: 'pad', style: { background: 'var(--panel)', flex: 1, overflow: 'auto' } });
        body.append(api.box, el('div', { class: 'win-foot' }, [el('span', { class: 'spacer' }), el('button', { class: 'btn', text: 'New', onclick: () => A.setTool('measure') }), el('button', { class: 'btn', text: 'Close', onclick: () => api.close() })]));
      } });
    if (!m) { w.box.innerHTML = ''; return; }
    let tot = 0;
    const segs = [];
    for (let i = 1; i < m.pts.length; i++) {
      const a = m.pts[i - 1], b = m.pts[i];
      const d = U.haversine(a.lat, a.lng, b.lat, b.lng); tot += d;
      segs.push(`<tr><td>${i}</td><td>${d >= 1000 ? (d / 1000).toFixed(3) + ' km' : d.toFixed(1) + ' m'}</td><td>${U.bearing(a.lat, a.lng, b.lat, b.lng).toFixed(1)}°</td></tr>`);
    }
    w.box.innerHTML = `<table class="identify-table"><tr class="grp"><td>Segment</td><td>Length (ellipsoidal)</td><td>Bearing</td></tr>${segs.join('')}</table>
      <div style="margin-top:8px;font-size:13px">Total: <b>${tot >= 1000 ? (tot / 1000).toFixed(3) + ' km' : tot.toFixed(1) + ' m'}</b></div>
      <div class="muted" style="margin-top:4px">Click to add points · right-click to finish · Esc to clear</div>`;
  };
  X.projectProperties = function () {
    UI.window({ id: 'props', title: 'Project Properties — AERIS', icon: 'settings', width: 700, height: 520, content: (body) => {
      const g = MET.grids;
      body.appendChild(el('div', { class: 'doc', html: `<h2>General</h2><table>
        <tr><th>Project</th><td>Project AERIS — volcanic gas dispersion &amp; CanSat vertical profiling (Davao City National High School)</td></tr>
        <tr><th>Map CRS</th><td>EPSG:3857 WGS 84 / Pseudo-Mercator (display), data in EPSG:4326; coordinate read-out: ${S.crs === '4326' ? 'EPSG:4326' : S.crs === '3857' ? 'EPSG:3857' : 'EPSG:32651 (UTM 51N)'}</td></tr>
        <tr><th>Meteorology</th><td>${U.esc(MET.describe())}${MET.fetchError ? `<br><span style="color:var(--bad)">Last error: ${U.esc(MET.fetchError)}</span>` : ''}</td></tr></table>
        <h2>Met grids</h2><table><tr><th>Grid</th><th>Extent</th><th>Spacing</th><th>Nodes</th><th>Hours</th></tr>
        ${g.map((x) => `<tr><td>${x.name}</td><td>${x.lat0}–${x.lat0 + (x.nlat - 1) * x.dlat}°N, ${x.lon0}–${x.lon0 + (x.nlon - 1) * x.dlon}°E</td><td>${x.dlat}°</td><td>${x.nlat}×${x.nlon}</td><td>${x.nt}</td></tr>`).join('')}</table>
        <h2>Vertical levels</h2><table><tr><th>Level</th><th>Height used</th></tr>${MET.LEVELS.map((l) => `<tr><td>${l.key}</td><td>${l.label}</td></tr>`).join('')}</table>
        <h2>CanSat site</h2><table><tr><th>Launch</th><td>${U.fmtLL(S.cfg.site.lat, S.cfg.site.lon, 6)} — UTM 51N ${(() => { const u = U.toUTM(S.cfg.site.lat, S.cfg.site.lon); return `${u.E.toFixed(0)} E, ${u.N.toFixed(0)} N`; })()}</td></tr>
        <tr><th>Point forecast</th><td>${S.point ? (S.point.source === 'open-meteo' ? `Open-Meteo ${U.esc(S.point.model)}, elevation ${U.fmtNum(S.point.elev)} m` : 'climatology') : 'not loaded'}</td></tr>
        <tr><th>Air quality</th><td>${S.point && S.point.aq ? U.esc(S.point.aq.source) : '—'}</td></tr></table>` }));
    } });
  };
  X.settings = function () {
    UI.window({ id: 'opts', title: 'Options', icon: 'settings', width: 520, height: 400, content: (body, api) => {
      const f = UI.form([
        { type: 'select', key: 'theme', label: 'UI theme', value: S.theme, options: [{ value: 'default', label: 'Default' }, { value: 'night', label: 'Night Mapping' }] },
        { type: 'select', key: 'units', label: 'Concentration units', value: S.style.units, options: [{ value: 'mix', label: 'Mixing ratio (ppb; CO₂ ppm)' }, { value: 'ug', label: 'Mass concentration (µg/m³)' }] },
        { type: 'select', key: 'crs', label: 'Coordinate read-out', value: S.crs, options: [{ value: '4326', label: 'EPSG:4326 — WGS 84 (degrees)' }, { value: '32651', label: 'EPSG:32651 — UTM zone 51N (m)' }, { value: '3857', label: 'EPSG:3857 — Pseudo-Mercator (m)' }] }
      ]);
      body.appendChild(el('div', { class: 'pad', style: { background: 'var(--panel)', flex: 1 } }, [f.el]));
      body.appendChild(el('div', { class: 'win-foot' }, [el('span', { class: 'spacer' }), el('button', { class: 'btn primary', text: 'OK', onclick: () => {
        const v = f.values();
        A.applyTheme(v.theme); S.style.units = v.units; U.lsSet('aeris.style', S.style);
        S.crs = v.crs; U.lsSet('aeris.crs', S.crs); document.querySelector('#sbCrs span').textContent = { '4326': 'EPSG:4326', '32651': 'EPSG:32651', '3857': 'EPSG:3857' }[S.crs];
        A.renderTime(); A.renderTree(); A.renderLegendDeco(); A.renderRight(); api.close();
      } }), el('button', { class: 'btn', text: 'Cancel', onclick: () => api.close() })]));
    } });
  };
  X.shortcuts = function () {
    UI.window({ id: 'keys', title: 'Keyboard Shortcuts', icon: 'help', width: 440, height: 360, content: (body) => body.appendChild(el('div', { class: 'doc', html: `<table>
      <tr><th>Ctrl+K</th><td>Locator search (volcanoes, towns, coordinates, algorithms)</td></tr><tr><th>Space</th><td>Play / pause temporal animation</td></tr>
      <tr><th>← / →</th><td>Previous / next hour</td></tr><tr><th>F1</th><td>Methodology &amp; factors</td></tr><tr><th>F6</th><td>Attribute table</td></tr>
      <tr><th>F7</th><td>Layer styling</td></tr><tr><th>Ctrl+Alt+T</th><td>Processing toolbox</td></tr><tr><th>Esc</th><td>Cancel pick / clear measurement or profile</td></tr>
      <tr><th>Shift+F1</th><td>Interactive tutorial</td></tr><tr><th>Double-click</th><td>Finish an elevation profile (profile tool)</td></tr>
      <tr><th>Right-click map</th><td>Identify, trajectory from point, move CanSat site</td></tr></table>` })) });
  };
  X.about = function () {
    UI.window({ id: 'about', title: 'About AERIS-GIS', icon: 'plume', width: 560, height: 470, content: (body) => body.appendChild(el('div', { class: 'doc', html: `
      <div class="about-head"><img src="icons/logo-128.png" alt="AERIS-GIS logo"><div><h2>AERIS-GIS</h2><span class="about-ver" title="Version">Version ${AERIS.VERSION}</span></div></div><p>A QGIS-style web GIS for <b>Project AERIS</b>: a real-time telemetry CanSat for vertical profiling of SO₂, H₂S, CO₂, particulate matter and meteorology, with a HYSPLIT-style volcanic gas dispersion model focused on <b>Mt. Apo</b> and <b>Mt. Leonard Kniaseff</b>.</p>
      <p>Everything is computed in the browser. External data: Open-Meteo forecast and air-quality APIs (CC-BY 4.0; NOAA GFS, ECMWF, DWD, JMA, CAMS) and map tiles from OpenStreetMap, OpenTopoMap, Esri and CARTO. Elevation: Copernicus DEM and NASADEM (Microsoft Planetary Computer), AWS Terrain Tiles. Libraries: Leaflet, d3-contour, Chart.js, three.js, geotiff.js, JSZip.</p>
      <p>Modelled concentrations are <b>indicative</b>. Emission rates are scenarios, so do not use the output for public-health decisions. Follow PHIVOLCS advisories and validate important cases with official HYSPLIT (see <i>Export ▸ HYSPLIT CONTROL</i>).</p>
      <p class="muted">Style inspired by QGIS; not affiliated with the QGIS project or NOAA ARL.</p>`, onclick: (e) => { if (e.target.closest('.about-ver')) AERIS.dev.tap(); } })) });
  };
  X.help = function () {
    UI.window({ id: 'help', title: 'Methodology & Model Factors', icon: 'help', width: 900, height: 700, content: (body) => body.appendChild(el('div', { class: 'doc', style: { overflow: 'auto' }, html: HELP_HTML })) });
  };
  const HELP_HTML = `
    <h2>1. Why not call HYSPLIT directly?</h2>
    <p>HYSPLIT has no open REST API. The READY site is interactive, and the desktop model needs ARL-format met files. AERIS-GIS re-implements HYSPLIT's Lagrangian method in JavaScript and feeds it the same <b>NOAA GFS 0.25°</b> forecast through <b>Open-Meteo</b> (free, no key, CORS-enabled). To check results against the real model, export a matching <code>CONTROL</code> file.</p>
    <h2>2. Factors in the dispersion model</h2>
    <table><tr><th>Factor</th><th>Source / value</th><th>Effect</th></tr>
    <tr><td>Wind (u, v) at 10 m, 1000, 925, 850, 700 hPa</td><td>GFS via Open-Meteo, hourly; 0.25° nest over Mindanao, 1° parent over the Philippines</td><td>Transport direction and speed; wind shear between levels splits the plume</td></tr>
    <tr><td>Terrain height</td><td>Open-Meteo elevation at grid nodes (bilinear)</td><td>Levels below ground are skipped; terrain-following inside the mixed layer</td></tr>
    <tr><td>Mixed-layer (PBL) depth</td><td>GFS <code>boundary_layer_height</code>; diurnal fallback 350→1400 m</td><td>Caps vertical mixing; decides whether a summit plume is lofted or mixed to the ground</td></tr>
    <tr><td>Atmospheric stability</td><td>Pasquill–Gifford class from local solar time, cloud cover and 10 m wind (Turner 1964)</td><td>Sets K<sub>z</sub> (1.5–200 m²/s) and K<sub>h</sub> (400–2500 m²/s)</td></tr>
    <tr><td>Source term</td><td>Vent coordinates &amp; elevation (GVP/PHIVOLCS), emission rate (t/d scenario), plume rise (m)</td><td>Vertical line source from the vent to vent + rise</td></tr>
    <tr><td>Dry deposition</td><td>v<sub>d</sub>: SO₂ 0.5 cm/s, H₂S 0.2 cm/s, CO₂ 0</td><td>Mass loss for particles in the lowest 75 m</td></tr>
    <tr><td>Wet deposition</td><td>GFS precipitation; Λ = A·P<sup>0.64</sup></td><td>Washout below 4 km during rain</td></tr>
    <tr><td>Chemistry</td><td>SO₂→SO₄²⁻ 1 %/h dry, rising to 5 %/h at RH 100 %; H₂S 2 %/h</td><td>First-order mass decay</td></tr>
    <tr><td>Averaging layer</td><td>0–100 m AGL (the CanSat profiling layer), 1-h mean</td><td>Concentration raster and contours</td></tr></table>
    <div class="eq">advection (Petterssen):  P' = P(t) + V(P,t)·Δt ;  P(t+Δt) = P(t) + ½[V(P,t) + V(P',t+Δt)]·Δt
turbulence:  Δx' = √(2·K_h·Δt)·N(0,1) ,  Δz' = √(2·K_z·Δt)·N(0,1)  (reflection at ground and PBL top)
concentration:  C = Σ m_i / (A_cell · Δz_layer) , averaged over the hour, Gaussian-smoothed (σ ≈ 1 cell)
µg/m³ → ppb:  ppb = µg/m³ × 24.45 / MW</div>
    <h2>3. Factors in the CanSat simulation</h2>
    <table><tr><th>Factor</th><th>Value / model</th></tr>
    <tr><td>Release</td><td>F450 quadcopter, servo clamp, 100 m AGL (≤ 122 m CAAP), climb 2.5 m/s, 10 s hover</td></tr>
    <tr><td>Descent physics</td><td>m·dv/dt = m·g − ½ρC<sub>d</sub>A v², canopy inflation ramp; ρ from site P, T, RH (moist air)</td></tr>
    <tr><td>Wind drift</td><td>Open-Meteo 10/80/120 m winds, log law below 10 m, Ornstein–Uhlenbeck gusts from the gust factor</td></tr>
    <tr><td>Landing dispersion</td><td>Monte Carlo (C<sub>d</sub> ±7 %, mass ±3 %, wind speed ±15 %, direction ±12°) → 95 % ellipse (χ² 5.991) + 50 m exclusion buffer</td></tr>
    <tr><td>Gas truth field</td><td>CAMS background (Open-Meteo AQ) + regional volcanic plume profile from the dispersion run + Gaussian plume from the hot-spring vent (Briggs rural σ)</td></tr>
    <tr><td>Sensors</td><td>First-order lag from t90, noise, resolution, LOD, cross-sensitivity, PM hygroscopic growth, BME280 enclosure lag</td></tr>
    <tr><td>Altitude</td><td>Firmware barometric formula referenced to pre-launch pressure; GPS with bias random walk and 1 s latency</td></tr>
    <tr><td>Telemetry</td><td>1 Hz frames with CRC-16/CCITT; logistic reception vs slant range and line of sight; lost packets filled from microSD; gaps &gt; 3 s flagged</td></tr>
    <tr><td>Go / no-go</td><td>Wind ≤ 10 m/s, no rain, no thunderstorm, visibility ≥ 2 km, crew SO₂ below WHO 10-min guideline</td></tr></table>
    <h2>4. Terrain (DEM) tools</h2>
    <table><tr><th>Tool</th><th>Method</th></tr>
    <tr><td>Elevation data</td><td>Copernicus DEM GLO-30 / GLO-90 (TanDEM-X, EGM2008 heights; a surface model that includes canopy and buildings) and NASADEM (reprocessed SRTM 2000, EGM96 heights), read as Cloud-Optimised GeoTIFFs from Microsoft Planetary Computer; or AWS Terrain Tiles (Terrarium). Each DEM is resampled bilinearly onto a Web-Mercator grid of at most 600–1400 cells per side, never finer than the source.</td></tr>
    <tr><td>Elevation heat map</td><td>Singleband pseudocolour; stretch by cumulative cut 2–98 % (QGIS default), min/max or a custom range.</td></tr>
    <tr><td>Hillshade, slope, aspect</td><td>Horn (1981) 3 × 3 gradient with the cell size corrected for latitude; hillshade = max(0, sun · surface normal), single or 4-direction (225°, 270°, 315°, 360°); aspect = the downhill direction, flat below 2°.</td></tr>
    <tr><td>Contour lines and polygons</td><td>Marching squares (d3-contour) on the DEM averaged to ≤ 800 cells and smoothed 3 × 3; automatic interval ≈ range / 25 rounded to 1-2-2.5-5 × 10ⁿ m; polygons are the bands between successive levels (ELEV_MIN / ELEV_MAX, as GDAL contour -p).</td></tr>
    <tr><td>Elevation profile</td><td>Sampled about once per DEM cell (100–1500 points). LoRa line of sight at 433 MHz: straight ray between the two antennas, Earth bulge with k = 4/3, and 60 % clearance of the first Fresnel zone r = √(λ d₁ d₂ / d).</td></tr></table>
    <div class="eq">hillshade = max(0, sin α − cos α · (g_E·sin A + g_N·cos A)) / √(g_E² + g_N² + 1)   (α sun altitude, A azimuth, g = z-factor × gradient)
slope = atan √(g_E² + g_N²) ;  aspect = atan2(−g_E, −g_N)</div>
    <h2>5. Limitations</h2>
    <ul><li>Met data resolution (0.25° ≈ 28 km) cannot resolve valley winds, sea breezes or katabatic flows around Mt. Apo; real plumes will meander more.</li>
    <li>No dense-gas physics: volcanic CO₂ pooling in depressions is <b>not</b> modelled.</li>
    <li>Emission rates for Mt. Apo and Mt. Leonard Kniaseff are assumptions; the output scales linearly with them.</li>
    <li>Pressure-level heights use a tropical standard atmosphere, not GFS geopotential heights.</li>
    <li>The terrain layers are for mapping and planning. The dispersion model still uses the met-grid terrain, not the 30 m DEM.</li></ul>
    <h2>6. Data sources</h2>
    <p>Open-Meteo Forecast API (GFS, ECMWF IFS, ICON, JMA) and Air-Quality API (CAMS global) — CC-BY 4.0. Volcano list: PHIVOLCS / Smithsonian GVP. Guideline values: WHO 2021 AQG, DENR NAAQGV (RA 8749).
    Elevation: Copernicus DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA; NASADEM (NASA JPL, 2020; LP DAAC); AWS Terrain Tiles (Mapzen). Hosted by Microsoft Planetary Computer and AWS Open Data.</p>`;

  /* ============================== startup ============================== */
  X.startup = async function () {
    A.busy('Loading GFS 0.25° winds from Open-Meteo…');
    UI.log('AERIS-GIS started', 'info');
    try {
      await MET.load({ onMsg: (m) => { A.busy(m); UI.log(m, 'debug', 'Network'); } });
    } catch (e) { UI.log('Meteorology failed: ' + e.message, 'err'); }
    const sel = document.getElementById('tbModel'); if (sel) sel.value = MET.model;
    if (MET.source === 'open-meteo') { UI.message('Meteorology loaded', U.esc(MET.describe()), 'ok', 7000); UI.log('Meteorology: ' + MET.describe(), 'ok', 'Network'); }
    else UI.message('Offline mode', 'Open-Meteo could not be reached. The map uses monsoon <b>climatology</b>: illustrative only, not a forecast.', 'warn', 0, { label: 'Retry', run: () => X.reloadMet() });
    updatePeriodLabel();
    A.buildTimeline(); A.renderTime(); A.renderRight();
    S.cfg.flightTime = defaultFlightTime();
    await X.autoRun(24);
  };
  /* priority-volcano forecast + trajectories + CanSat flight for the loaded period */
  X.autoRun = async function (hours) {
    try {
      await X.runQuick(['apo', 'leonard'], { species: S.species || 'SO2', hours: Math.max(6, hours || 24) });
      X.runTrajectories(['apo', 'leonard'], { silent: true, hours: Math.min(48, Math.max(6, hours || 24)) });
      X.runBackTraj({ silent: true });
      await X.runCansat({ silent: true });
      A.renderRight();
    } catch (e) { console.error(e); UI.message('Model run', U.esc(e.message), 'err', 0); }
    A.busy(null);
    UI.status(`Ready — ${MET.periodLabel()} · Mt. Apo & Mt. Leonard Kniaseff forecast loaded. Press Space to animate, 🚀 Deploy CanSat for the 3D simulation.`);
  };

  A.init();
})();

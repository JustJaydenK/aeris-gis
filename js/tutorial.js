/* AERIS-GIS — interactive tutorial: a spotlight tour of the interface. It runs on first start, and afterwards
   it is opened from the 🎓 Tutorial button in the toolbar or Help ▸ Interactive Tutorial. */
(function () {
  'use strict';
  const U = AERIS.U, UI = AERIS.ui, A = AERIS.app, el = U.el;
  const TT = AERIS.tutorial = {};
  const KEY = 'aeris.tutorial';
  const state = () => Object.assign({ auto: true }, U.lsGet(KEY, {}));
  TT.isAuto = () => state().auto;
  TT.setAuto = (v) => U.lsSet(KEY, Object.assign(state(), { auto: !!v }));

  UI.icons.tutorial = '<path d="M12 4l10 5-10 5L2 9z" fill="#2b6cb0"/><path d="M6.5 11.6v4.2c2.6 2.4 8.4 2.4 11 0v-4.2" fill="#bbdefb" stroke="#2b6cb0" stroke-width="1.2"/><path d="M21.2 9.4v5.4" stroke="#2b6cb0" stroke-width="1.4"/><circle cx="21.2" cy="15.4" r="1" fill="#2b6cb0"/>';

  const showLeft = () => { const m = document.getElementById('main'); if (window.innerWidth > 900 && m.classList.contains('no-left')) A.togglePanel('left'); };
  const showTemporal = () => { const t = document.getElementById('temporalDock'); if (t.classList.contains('hidden')) A.togglePanel('temporal'); };

  const STEPS = [
    { title: 'Welcome to AERIS-GIS', html: '<p>AERIS-GIS forecasts where volcanic gas from <b>Mt. Apo</b> and <b>Mt. Leonard Kniaseff</b> travels, and simulates the AERIS CanSat flight at the Mainit/Toyozu Hot Spring site.</p><p>This tour takes about two minutes. The weather data keeps loading in the background while you read.</p><p class="muted">Use the arrow keys or the buttons below. Esc closes the tour.</p>' },
    { target: '#menubar', title: 'Menu bar', html: '<p>Every command lives here, as in QGIS:</p><ul><li><b>Project</b>: dates, exports (GeoJSON, CSV, HYSPLIT CONTROL) and the print layout.</li><li><b>View</b>: panels, zoom shortcuts, the 3D deployment and map decorations.</li><li><b>Layer / Raster</b>: basemaps, attribute table, styling and <b>Terrain (DEM)</b>.</li><li><b>Processing</b>: every model. <b>Help</b>: methodology and this tutorial.</li></ul>' },
    { target: '[data-tour="nav"]', title: 'Move around the map', html: 'Pan, zoom in and out, zoom to the Philippines, to Mt. Apo and Mt. Leonard Kniaseff, or to the selected layer. You can also drag the map to pan and scroll to zoom.' },
    { target: '[data-tour="inspect"]', title: 'Inspect and measure', html: '<b>Identify</b>: click the map to read wind, stability, modelled gas concentration and terrain elevation at that point. <b>Measure</b>: click points and right-click to finish. <b>Attribute table</b> (F6): the data behind each layer.' },
    { target: '[data-tour="model"]', title: 'Run the models', html: '<b>Run Dispersion</b> starts the HYSPLIT-style gas model. Next to it are forward trajectories, backward trajectories from the CanSat site, the CanSat descent simulation, the six-flight campaign and the Processing Toolbox.' },
    { target: '[data-tour="terrain"]', title: 'Terrain: heat maps, hillshade and contours', html: '<p><b>Terrain</b> downloads a real elevation model for the map view: <b>Copernicus DEM GLO-30 / GLO-90</b>, <b>NASADEM</b> or AWS Terrain Tiles. No account or API key is needed.</p><p>It draws an <b>elevation heat map</b>, hillshade, slope, aspect, <b>contour lines</b> and <b>contour polygons</b>, like QGIS. The profile button next to it draws an elevation profile and checks the LoRa line of sight.</p>' },
    { target: '[data-tour="deploy"]', title: '3D deployment and figures', html: '<b>Deploy 3D</b> replays the CanSat flight over real terrain and satellite imagery. <b>Figures</b> opens a print layout with numbered, captioned figures that you can save as PNG, ZIP or PDF.' },
    { target: '[data-tour="time"]', title: 'Dates and time', html: 'The 📅 button picks the forecast period: the latest forecast, or any past or future dates. The clock button shows or hides the Temporal Controller.' },
    { target: '#layersDock', before: showLeft, title: 'Layers panel', html: 'Tick a layer to show it. Click a layer to select it, double-click to zoom to it, and right-click for exports and styling. The <b>Terrain — DEM</b> group holds the elevation layers; ticking one loads the DEM for the current view.' },
    { target: '#canvasArea', title: 'Map canvas', html: 'Right-click anywhere to identify a point, copy its coordinates, start a trajectory there, or move the CanSat launch site or ground station. The buttons at the top right deploy the CanSat (🚀), open the 3D view and open the figures.' },
    { target: '#rightDock', before: () => A.showRight('forecast'), title: 'Side panel', html: 'The tabs at the bottom switch between the <b>Plume Forecast</b> for the priority volcanoes, the <b>Processing</b> toolbox, <b>Identify</b> results and <b>Layer Styling</b>.' },
    { target: '#temporalDock', before: showTemporal, title: 'Temporal Controller', html: 'Play the model hour by hour (Space), step with ← and →, or jump to a day. The 📅 button here also changes the dates.' },
    { target: '#statusbar', title: 'Status bar', html: 'Search with the locator (Ctrl+K) for volcanoes, towns, coordinates and algorithms. The status bar also shows the cursor coordinates and <b>elevation</b>, the map scale, the coordinate system and the message log.' },
    { target: '[data-tour="tutorial"]', title: 'You are ready', html: 'Open this tutorial again at any time with this button or <b>Help ▸ Interactive Tutorial</b>. Press <b>F1</b> for the methodology and the model factors.' }
  ];

  /* phone layout (Android): the bottom navigation replaces the menus and toolbars */
  const M_STEPS = [
    STEPS[0],
    { target: '#mBar', title: 'Top bar', html: 'Search for a volcano, town, coordinates or tool with 🔍, and change the forecast dates with 📅. The line under the name shows the loaded forecast period.' },
    { target: '#canvasArea', title: 'The map', html: 'Pinch to zoom and drag to move. <b>Long-press</b> a point to identify it, start a trajectory there, or move the CanSat launch site or ground station.' },
    { target: '#mNav [data-tab="layers"]', title: 'Layers', html: 'Turn map layers on and off: the gas plume, trajectories, CanSat track and landing zone, and the <b>Terrain</b> layers (elevation heat map, hillshade, contours).' },
    { target: '#mNav [data-tab="forecast"]', title: 'Plume forecast', html: 'Where the gas from Mt. Apo and Mt. Leonard Kniaseff is heading over the next 24 hours, and which towns it reaches.' },
    { target: '#mNav [data-tab="tools"]', title: 'Tools', html: 'Every model in big buttons: run the dispersion, deploy the CanSat on the map or in 3D, terrain heat maps and contours, the elevation profile, figures and exports.' },
    { target: '#mNav [data-tab="more"]', title: 'More', html: 'All the desktop menus (Project, View, Layer, Raster, Processing, Settings, Help) and the version information.' },
    { target: '#mTime', title: 'Time bar', html: 'Play the forecast hour by hour, step with ◀ ▶, or drag the slider.' },
    { title: 'You are ready', html: 'Android\'s Back button closes the open panel or window. Open this tutorial again from <b>Tools ▸ Tutorial</b>.' }
  ];
  let ST = STEPS;
  let cur = -1, dom = null;
  function build() {
    const block = el('div', { class: 'tour-block' });
    const spot = el('div', { class: 'tour-spot hidden' });
    const card = el('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tourTitle' });
    const auto = el('input', { type: 'checkbox' });
    auto.checked = false;
    card.append(
      el('header', {}, [el('b', { id: 'tourTitle' }), el('span', { class: 'n' })]),
      el('div', { class: 'tb' }),
      el('div', { class: 'tour-dots' }, ST.map((_, i) => el('i', { title: `Step ${i + 1}`, onclick: () => go(i) }))),
      el('footer', {}, [
        el('label', { title: 'Show the tour every time AERIS-GIS starts' }, [auto, el('span', { text: 'Show at startup' })]),
        el('button', { class: 'btn', 'data-act': 'skip', text: 'Skip tour', onclick: () => TT.end() }),
        el('button', { class: 'btn', 'data-act': 'back', text: '◀ Back', onclick: () => go(cur - 1) }),
        el('button', { class: 'btn primary', 'data-act': 'next', text: 'Next ▶', onclick: () => next() })]));
    block.addEventListener('click', (e) => e.stopPropagation());
    document.body.append(block, spot, card);
    return { block, spot, card, auto };
  }
  function targetOf(step) {
    if (!step.target) return null;
    const t = document.querySelector(step.target);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && getComputedStyle(t).visibility !== 'hidden' ? r : null;
  }
  function place() {
    const step = ST[cur], r = targetOf(step), { spot, card, block } = dom;
    const vw = window.innerWidth, vh = window.innerHeight, cw = card.offsetWidth, ch = card.offsetHeight, gap = 12;
    if (!r) {
      spot.classList.add('hidden'); block.classList.add('dim');
      card.style.left = Math.max(8, (vw - cw) / 2) + 'px'; card.style.top = Math.max(8, (vh - ch) / 2) + 'px';
      return;
    }
    block.classList.remove('dim'); spot.classList.remove('hidden');
    const p = 4, x0 = Math.max(2, r.left - p), y0 = Math.max(2, r.top - p), x1 = Math.min(vw - 2, r.right + p), y1 = Math.min(vh - 2, r.bottom + p);
    Object.assign(spot.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
    const clampX = (x) => U.clamp(x, 8, vw - cw - 8), clampY = (y) => U.clamp(y, 8, vh - ch - 8);
    let left, top;
    if (y1 + gap + ch <= vh - 8) { left = clampX(x0); top = y1 + gap; }                 // below
    else if (y0 - gap - ch >= 8) { left = clampX(x0); top = y0 - gap - ch; }             // above
    else if (x1 + gap + cw <= vw - 8) { left = x1 + gap; top = clampY(y0); }             // right
    else if (x0 - gap - cw >= 8) { left = x0 - gap - cw; top = clampY(y0); }             // left
    else { left = clampX(x0 + 16); top = clampY(y0 + 16); }                              // inside a large target
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }
  function go(i) {
    if (!dom) return;
    cur = U.clamp(i, 0, ST.length - 1);
    const step = ST[cur];
    if (step.before) { try { step.before(); } catch (e) { /* panel missing on small screens */ } }
    const { card } = dom;
    card.querySelector('#tourTitle').textContent = step.title;
    card.querySelector('.n').textContent = `${cur + 1} / ${ST.length}`;
    card.querySelector('.tb').innerHTML = step.html + (step.target && !targetOf(step) ? '<p class="muted">(This part is hidden at the current window size.)</p>' : '');
    card.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === cur));
    card.querySelector('[data-act="back"]').disabled = cur === 0;
    card.querySelector('[data-act="next"]').textContent = cur === ST.length - 1 ? 'Finish' : 'Next ▶';
    card.querySelector('[data-act="skip"]').classList.toggle('hidden', cur === ST.length - 1);
    // panels opened by `before` change the layout; place after it settles
    requestAnimationFrame(() => { place(); setTimeout(() => dom && place(), 80); });
    card.querySelector('[data-act="next"]').focus({ preventScroll: true });
  }
  const next = () => (cur >= ST.length - 1 ? TT.end() : go(cur + 1));
  function onKey(e) {
    if (!dom) return;
    const k = e.key, onCtl = /BUTTON|INPUT/.test(e.target.tagName) && dom.card.contains(e.target);
    e.stopPropagation();                                   // keep Space / arrows / shortcuts away from the map while touring
    if (k === 'Tab' || ((k === 'Enter' || k === ' ') && onCtl)) return;   // normal focus and button behaviour
    e.preventDefault();
    if (k === 'Escape') TT.end();
    else if (k === 'ArrowRight' || k === 'Enter') next();
    else if (k === 'ArrowLeft') go(cur - 1);
  }
  const onResize = () => dom && place();

  TT.start = function (i = 0) {
    if (dom) { go(i); return; }
    UI.closeMenus && UI.closeMenus();
    ST = document.body.classList.contains('m-ui') ? M_STEPS : STEPS;
    dom = build();
    dom.auto.checked = state().auto && state().seen === true;
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    go(i);
    UI.log('Tutorial opened', 'info');
  };
  TT.end = function () {
    if (!dom) return;
    U.lsSet(KEY, Object.assign(state(), { auto: dom.auto.checked, seen: true }));
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    [dom.block, dom.spot, dom.card].forEach((n) => n.remove());
    dom = null; cur = -1;
    UI.status('Tutorial closed. Open it again with 🎓 Tutorial in the toolbar or Help ▸ Interactive Tutorial.');
  };
  TT.active = () => !!dom;
  /* first start (or "Show at startup" ticked): open once the interface has been laid out */
  TT.maybeAutoStart = function () { if (state().auto) setTimeout(() => TT.start(0), 600); };
})();

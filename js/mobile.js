/* AERIS-GIS — phone layout (Android app / installed web app).
   Below 760 px the QGIS-style menus and toolbars give way to a top app bar, a bottom navigation bar
   (Map · Layers · Forecast · Tools · More), a compact time bar and full-screen panels; Android's Back button
   closes the open panel or window. Above 760 px the desktop layout is unchanged. */
(function () {
  'use strict';
  const U = AERIS.U, UI = AERIS.ui, D = AERIS.data, A = AERIS.app, S = A.S, el = U.el;
  const M = AERIS.mobile = { tab: 'map' };
  const MQ = window.matchMedia('(max-width: 760px)');
  const X = () => A.actions;
  let built = false;
  const TABS = [['map', 'Map', 'globe'], ['layers', 'Layers', 'layers'], ['forecast', 'Forecast', 'plume'], ['tools', 'Tools', 'toolbox'], ['more', 'More', 'settings']];

  const ibtn = (ico, title, fn) => el('button', { class: 'm-ibtn', title, 'aria-label': title, html: UI.icon(ico), onclick: fn });

  function build() {
    const app = document.getElementById('app');
    const bar = el('header', { id: 'mBar' }, [
      el('img', { class: 'm-logo', src: 'icons/logo-128.png', alt: 'AERIS-GIS logo' }),
      el('div', { class: 'm-title' }, [el('b', { text: 'AERIS-GIS' }), el('span', { id: 'mSub', text: 'Loading weather…' })]),
      ibtn('search', 'Search', () => M.open('search')),
      el('button', { class: 'm-ibtn m-date', title: 'Change the dates', 'aria-label': 'Change the dates', text: '📅', onclick: () => X().periodDialog() })]);
    const time = el('div', { id: 'mTime' }, [
      ibtn('stepB', 'Previous hour', () => A.setFrame(S.ti - 1)),
      el('button', { class: 'm-ibtn m-play', id: 'mPlay', title: 'Play / pause', 'aria-label': 'Play or pause', html: UI.icon('play'), onclick: () => A.togglePlay() }),
      ibtn('stepF', 'Next hour', () => A.setFrame(S.ti + 1)),
      el('input', { type: 'range', id: 'mSlider', min: 0, max: 0, value: 0, 'aria-label': 'Time', oninput: (e) => A.setFrame(+e.target.value) }),
      el('span', { id: 'mClock', class: 'm-clock' })]);
    const nav = el('nav', { id: 'mNav', 'aria-label': 'Main' }, TABS.map(([id, label, ico]) =>
      el('button', { 'data-tab': id, html: `${UI.icon(ico)}<span>${label}</span>`, onclick: () => M.open(M.tab === id && id !== 'map' ? 'map' : id) })));
    app.insertBefore(bar, app.firstChild);
    app.append(time, nav);
    document.getElementById('main').appendChild(el('div', { id: 'mSheet', class: 'hidden' }));
    // Android Back: close the top window, then the open panel
    new MutationObserver((ms) => { if (MQ.matches && ms.some((m) => m.addedNodes.length)) history.pushState({ aeris: 'win' }, ''); })
      .observe(document.getElementById('windowLayer'), { childList: true });
    window.addEventListener('popstate', () => {
      if (!MQ.matches) return;
      const wins = [...document.querySelectorAll('#windowLayer .win')];
      if (wins.length) { const top = wins.sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0]; const c = top.querySelector('.wt-btn'); if (c) c.click(); return; }
      if (M.tab !== 'map') M.open('map', true);
    });
    const orig = A.renderTime;
    A.renderTime = function () { orig.apply(this, arguments); updateTime(); };
    const origPlay = A.togglePlay;
    A.togglePlay = function () { origPlay.apply(this, arguments); updateTime(); };
    const origRight = A.showRight;
    A.showRight = function (tab) {
      // phone: the Identify tool should leave the map visible until a point has been tapped
      if (MQ.matches && tab === 'identify' && !S.identify) { S.rightTab = 'identify'; return; }
      origRight.apply(this, arguments);
      if (MQ.matches) { closeSheet(); setTab(tab === 'forecast' ? 'forecast' : 'panel'); }
    };
    const origPanel = A.togglePanel;
    A.togglePanel = function () {
      origPanel.apply(this, arguments);
      if (!MQ.matches) return;
      const m = document.getElementById('main');
      if (M.tab === 'layers' && !m.classList.contains('show-left-mobile')) setTab('map');
      if ((M.tab === 'forecast' || M.tab === 'panel') && m.classList.contains('no-right')) setTab('map');
    };
    built = true;
  }

  function updateTime() {
    if (!built) return;
    const t = A.currentTime(), sl = document.getElementById('mSlider');
    sl.max = Math.max(0, S.timeline.length - 1); sl.value = S.ti;
    document.getElementById('mClock').textContent = U.fmtPHT(t, true);
    document.getElementById('mPlay').innerHTML = UI.icon(S.playing ? 'pause' : 'play');
    const met = AERIS.met;
    document.getElementById('mSub').textContent = met && met.ready ? met.periodLabel() : 'Loading weather…';
  }
  function setTab(id) {
    M.tab = id;
    document.querySelectorAll('#mNav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
  }
  function closeSheet() { const s = document.getElementById('mSheet'); if (s) { s.classList.add('hidden'); s.innerHTML = ''; } }
  function closePanels() {
    const main = document.getElementById('main');
    main.classList.remove('show-left-mobile');
    main.classList.add('no-right');
    closeSheet();
  }
  M.open = function (id, fromBack) {
    if (!built) return;
    closePanels();
    if (id === 'layers') document.getElementById('main').classList.add('show-left-mobile');
    else if (id === 'forecast') A.showRight('forecast');
    else if (id !== 'map') showSheet(id);
    setTab(id);
    if (id !== 'map' && !fromBack) history.pushState({ aeris: id }, '');
    setTimeout(() => S.map && S.map.invalidateSize({ pan: false }), 60);
  };

  /* ---------- sheets ---------- */
  function showSheet(id) {
    const s = document.getElementById('mSheet');
    s.innerHTML = '';
    s.classList.remove('hidden');
    s.scrollTop = 0;
    if (id === 'tools') toolsSheet(s);
    if (id === 'more') moreSheet(s);
    if (id === 'search') searchSheet(s);
  }
  const go = (fn) => () => { M.open('map'); setTimeout(fn, 30); };
  function toolsSheet(s) {
    const TR = AERIS.terrain, TT = AERIS.tutorial;
    const groups = [
      ['Volcanic gas', [['plume', 'Run dispersion', () => X().dispersionDialog()], ['refresh', 'Quick 24 h forecast', () => X().runQuick(['apo', 'leonard'])],
        ['traj', 'Forward trajectories', () => X().trajDialog()], ['backtraj', 'Back-trajectories (CanSat site)', () => X().backTrajDialog()],
        ['table', 'Town exposure table', () => X().attributeTable('receptors')]]],
      ['CanSat mission', [['cansat', 'Deploy on the map', () => X().deploy()], ['cansat', 'Deploy in 3D', () => AERIS.scene3d.open({ deploy: true })],
        ['cansat', 'Descent simulation', () => X().cansatDialog()], ['campaign', 'Six-flight campaign', () => X().campaignRun()],
        ['cansat', 'Ground station', () => X().groundStation()], ['cansat', 'Parachute sizing', () => X().parachuteCalc()]]],
      ['Terrain', [['terrain', 'Terrain: heat map & contours', () => TR.dialog()], ['profile', 'Elevation profile', () => A.setTool('profile')],
        ['profile', 'Ground station → launch site', () => TR.profileBetween(S.cfg.gs, S.cfg.site, 'Ground station → CanSat launch site')],
        ['table', 'DEM statistics', () => TR.statsWindow()]]],
      ['Map tools', [['identify', 'Identify a point', () => A.setTool('identify')], ['measure', 'Measure distance', () => A.setTool('measure')],
        ['pan', 'Pan (stop tool)', () => A.setTool('pan')], ['zoomVolcano', 'Zoom to Mt. Apo & Leonard', () => A.zoomTo('priority')],
        ['cansat', 'Zoom to CanSat site', () => A.zoomTo('site')], ['zoomFull', 'Zoom to the Philippines', () => A.zoomTo('ph')]]],
      ['Results', [['save', 'Figures for the paper', () => AERIS.figures.open()], ['save', 'Export everything (GeoJSON)', () => X().exportAll()],
        ['clock', 'Change dates', () => X().periodDialog()], ['tutorial', 'Tutorial', () => TT.start(0)]]]
    ];
    if (AERIS.dev && AERIS.dev.enabled()) groups.push(['Developer', [['settings', 'Developer tools', () => AERIS.dev.open()]]]);
    groups.forEach(([title, items]) => {
      s.appendChild(el('h3', { class: 'm-h', text: title }));
      s.appendChild(el('div', { class: 'm-grid' }, items.map(([ico, label, fn]) =>
        el('button', { class: 'm-tile', html: `${UI.icon(ico)}<span>${U.esc(label)}</span>`, onclick: go(fn) }))));
    });
    s.appendChild(el('div', { class: 'm-hint', text: 'Tip: long-press the map for Identify, trajectories from a point, or to move the launch site. Double-tap to finish an elevation profile.' }));
  }
  function menuList(items, depth) {
    const ul = el('div', { class: 'm-menu' + (depth ? ' sub' : '') });
    (typeof items === 'function' ? items() : items).forEach((it) => {
      if (it === '-' || it.header) return;
      const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
      const chk = typeof it.checked === 'function' ? it.checked() : it.checked;
      const row = el('button', { class: 'm-mi' + (dis ? ' dis' : ''), disabled: dis || undefined,
        html: `<span class="mi-ico">${it.icon ? UI.icon(it.icon) : chk ? '✓' : ''}</span><span>${U.esc(it.label)}</span>${it.submenu ? '<span class="mi-more">▸</span>' : chk && it.icon ? '<span class="mi-more">✓</span>' : ''}` });
      ul.appendChild(row);
      if (it.submenu) {
        let open = null;
        row.addEventListener('click', () => { if (open) { open.remove(); open = null; return; } open = menuList(it.submenu, depth + 1); row.after(open); });
      } else row.addEventListener('click', go(it.action));
    });
    return ul;
  }
  function moreSheet(s) {
    const about = el('div', { class: 'm-about' }, [el('img', { src: 'icons/logo-128.png', alt: '' }),
      el('div', {}, [el('b', { text: 'AERIS-GIS' }), el('span', { class: 'm-ver', text: `Version ${AERIS.VERSION || ''} · Project AERIS · DCNHS`, onclick: () => AERIS.dev && AERIS.dev.tap() })])]);
    s.appendChild(about);
    (A.menus || []).forEach((m) => {
      const head = el('button', { class: 'm-sec', html: `<span>${U.esc(m.label)}</span><span class="mi-more">▾</span>` });
      let list = null;
      head.addEventListener('click', () => { if (list) { list.remove(); list = null; head.classList.remove('open'); return; } list = menuList(m.items, 0); head.after(list); head.classList.add('open'); });
      s.appendChild(head);
    });
  }
  function searchSheet(s) {
    const inp = el('input', { class: 'm-search', type: 'search', placeholder: 'Volcano, town, coordinates or tool', autocomplete: 'off' });
    const res = el('div', { class: 'm-menu' });
    s.append(inp, res);
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      res.innerHTML = '';
      if (!q) return;
      const items = [];
      const c = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
      if (c) { let a = +c[1], b = +c[2]; if (Math.abs(a) > 90) [a, b] = [b, a]; items.push(['Go to coordinates', U.fmtLL(a, b), () => { S.map.setView([a, b], Math.max(S.map.getZoom(), 12)); A.identifyAt(L.latLng(a, b)); }]); }
      D.volcanoes.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 6).forEach((v) => items.push([v.name, `Volcano · ${v.prov}`, () => S.map.setView([v.lat, v.lon], 11)]));
      D.receptors.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 6).forEach((r) => items.push([r.name, 'Town', () => S.map.setView([r.lat, r.lon], 12)]));
      if (/cansat|mainit|toyozu|site/.test(q)) items.push([D.site.name, 'CanSat field site', () => A.zoomTo('site')]);
      (A.algorithms || []).filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8).forEach((a) => items.push([a.name, a.group, a.run]));
      if (!items.length) res.appendChild(el('div', { class: 'm-hint', text: 'Nothing found.' }));
      items.forEach(([label, sub, fn]) => res.appendChild(el('button', { class: 'm-mi', html: `<span>${U.esc(label)}<small>${U.esc(sub)}</small></span>`, onclick: go(fn) })));
    };
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    setTimeout(() => inp.focus(), 50);
  }
  M.refresh = function () { if (M.tab === 'tools' || M.tab === 'more') showSheet(M.tab); };

  /* ---------- switch layouts with the screen width ---------- */
  function apply() {
    const on = MQ.matches;
    if (on && !built) build();
    document.body.classList.toggle('m-ui', on);
    if (on) { M.open('map', true); updateTime(); }
    else if (built) { closeSheet(); document.getElementById('main').classList.remove('show-left-mobile'); }
    setTimeout(() => S.map && S.map.invalidateSize({ pan: false }), 80);
  }
  M.init = function () {
    apply();
    MQ.addEventListener ? MQ.addEventListener('change', apply) : MQ.addListener(apply);
  };
})();

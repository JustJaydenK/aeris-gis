/* AERIS-GIS — developer mode for the project team.
   Unlock: tap the version 7 times (Help ▸ About, or More ▸ About on a phone), like Android's developer options.
   Gives diagnostics, an on-screen console (phones have no DevTools), cache / update controls and a JavaScript
   runner. It works only inside this app on this device; nothing in it is reachable from another device. */
(function () {
  'use strict';
  const U = AERIS.U;
  const DV = AERIS.dev = { VERSION: '2.3.0', logs: [] };
  AERIS.VERSION = DV.VERSION;
  const ui = () => AERIS.ui;

  /* ---------- console capture (ring buffer, always on so errors before unlocking are kept) ---------- */
  const fmt = (a) => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.stack || a.message;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  };
  function push(level, args) {
    DV.logs.push({ t: new Date(), level, msg: args.map(fmt).join(' ') });
    if (DV.logs.length > 500) DV.logs.shift();
    if (DV.onLog) DV.onLog();
  }
  ['log', 'info', 'warn', 'error'].forEach((k) => {
    const orig = console[k].bind(console);
    console[k] = (...a) => { push(k, a); orig(...a); };
  });
  window.addEventListener('error', (e) => push('error', [`${e.message} @ ${String(e.filename || '').split('/').pop()}:${e.lineno}`]));
  window.addEventListener('unhandledrejection', (e) => push('error', ['Unhandled promise rejection: ' + fmt(e.reason && e.reason.message ? e.reason.message : e.reason)]));

  /* ---------- unlock ---------- */
  DV.enabled = () => U.lsGet('aeris.dev', false) === true;
  let taps = 0, last = 0;
  DV.tap = function () {
    const now = Date.now();
    taps = now - last < 1500 ? taps + 1 : 1;
    last = now;
    if (DV.enabled()) { if (taps === 1) ui().status('Developer mode is on: Help ▸ Developer Tools.'); return; }
    const left = 7 - taps;
    if (left <= 0) { taps = 0; DV.setEnabled(true); }
    else if (taps >= 3) ui().message('Developer mode', `Tap ${left} more time${left > 1 ? 's' : ''} to turn on developer mode.`, 'info', 1500);
  };
  DV.setEnabled = function (v) {
    U.lsSet('aeris.dev', !!v);
    ui().message('Developer mode', v ? 'Developer mode is on. Open it from Help ▸ Developer Tools (Ctrl+Shift+D), or More ▸ Developer tools on a phone.' : 'Developer mode is off.', 'ok', 6000);
    if (AERIS.mobile && AERIS.mobile.refresh) AERIS.mobile.refresh();
    if (v) DV.open();
  };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (DV.enabled()) DV.open(); else ui().status('Developer mode is off. Tap the version in Help ▸ About 7 times to turn it on.');
    }
  });

  /* ---------- diagnostics ---------- */
  async function info() {
    const nav = navigator, sw = nav.serviceWorker ? await nav.serviceWorker.getRegistration().catch(() => null) : null;
    let cache = '—';
    if (window.caches) {
      try { const keys = await caches.keys(); cache = (await Promise.all(keys.map(async (k) => `${k} (${(await (await caches.open(k)).keys()).length} files)`))).join(', ') || 'empty'; } catch (e) { cache = 'unavailable'; }
    }
    const mode = ['fullscreen', 'standalone', 'minimal-ui'].find((m) => matchMedia(`(display-mode: ${m})`).matches) || 'browser tab';
    const met = AERIS.met, T = AERIS.terrain;
    return [
      ['App version', DV.VERSION], ['Address', location.href], ['Running as', /[?&]desktop=1/.test(location.search) ? 'Windows desktop app' : mode === 'browser tab' ? 'browser tab' : `installed app (${mode})`],
      ['Phone layout', document.body.classList.contains('m-ui') ? 'on' : 'off'], ['Online', nav.onLine ? 'yes' : 'no'],
      ['Screen', `${screen.width} × ${screen.height}, window ${innerWidth} × ${innerHeight}, pixel ratio ${devicePixelRatio}`],
      ['Device', nav.userAgent], ['Service worker', sw ? (sw.active ? sw.active.state : 'installing') : (window.isSecureContext ? 'not registered' : 'needs https')], ['Offline cache', cache],
      ['Saved settings', Object.keys(localStorage).filter((k) => k.startsWith('aeris.')).join(', ') || 'none'],
      ['Meteorology', met && met.describe ? met.describe() : '—'], ['Terrain DEM', T && T.dem ? `${T.dem.source}, ${T.dem.W} × ${T.dem.H}` : 'not loaded'],
      ['Errors logged', String(DV.logs.filter((l) => l.level === 'error').length)]
    ];
  }
  DV.forceUpdate = async function () {
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    location.reload();
  };

  /* ---------- window ---------- */
  DV.open = function () {
    const UI = ui(), el = U.el;
    const old = UI.getWindow('dev');
    if (old) { old.focus(); return; }
    UI.window({ id: 'dev', title: `Developer Tools — AERIS-GIS ${DV.VERSION}`, icon: 'settings', width: 760, height: Math.min(620, innerHeight - 30),
      onClose: () => { DV.onLog = null; },
      content: (body, api) => {
        const tabs = UI.tabs(body, [{ id: 'info', label: 'Info' }, { id: 'console', label: 'Console' }, { id: 'run', label: 'Run JS' }]);
        Object.values(tabs.panes).forEach((p) => p.classList.add('dev-pane'));
        // info
        const tbl = el('table', { class: 'identify-table' });
        const fill = async () => { tbl.innerHTML = ''; (await info()).forEach(([k, v]) => tbl.appendChild(el('tr', {}, [el('td', { text: k }), el('td', { text: v })]))); };
        const btn = (t, fn, cls) => el('button', { class: 'btn' + (cls ? ' ' + cls : ''), text: t, onclick: fn });
        tabs.panes.info.append(el('div', { class: 'dem-btns dev-btns' }, [
          btn('Refresh', fill),
          btn('Force update', () => DV.forceUpdate(), 'primary'),
          btn('Reload', () => location.reload()),
          btn('Reset tutorial', () => { localStorage.removeItem('aeris.tutorial'); UI.message('Developer', 'The tutorial will show at the next start.', 'ok', 4000); }),
          btn('Clear saved settings', () => { if (confirm('Clear all saved AERIS-GIS settings on this device (styles, theme, tutorial, terrain)?')) { Object.keys(localStorage).filter((k) => k.startsWith('aeris.') && k !== 'aeris.dev').forEach((k) => localStorage.removeItem(k)); fill(); } }),
          btn('Export diagnostics', async () => U.download(`aeris_diagnostics_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`,
            JSON.stringify({ info: Object.fromEntries(await info()), logs: DV.logs }, null, 1), 'application/json')),
          btn('Turn developer mode off', () => { DV.setEnabled(false); api.close(); })]), tbl);
        fill();
        // console
        const box = el('div', { class: 'dev-console' });
        const draw = () => {
          box.innerHTML = '';
          DV.logs.slice(-300).forEach((l) => box.appendChild(el('div', { class: 'dl ' + l.level, text: `${l.t.toTimeString().slice(0, 8)}  ${l.msg}` })));
          box.scrollTop = box.scrollHeight;
        };
        tabs.panes.console.append(el('div', { class: 'dem-btns dev-btns' }, [btn('Clear', () => { DV.logs.length = 0; draw(); }),
          btn('Copy all', () => navigator.clipboard && navigator.clipboard.writeText(DV.logs.map((l) => `${l.t.toISOString()} [${l.level}] ${l.msg}`).join('\n')))]), box);
        DV.onLog = () => { if (tabs.current === 'console') draw(); };
        draw();
        // run
        const ta = el('textarea', { class: 'dev-code', spellcheck: 'false', placeholder: 'JavaScript, e.g.  AERIS.app.S.cfg   or   await AERIS.terrain.load({ area: "site" })' });
        const out = el('pre', { class: 'dev-out' });
        const run = async () => {
          try {
            const src = ta.value.trim();
            const fn = new Function('return (async () => { ' + (/^(const|let|var|if|for|await\s+\w+\s*=)|;/.test(src) ? src : 'return (' + src + ')') + ' })()');
            const r = await fn();
            out.className = 'dev-out'; out.textContent = r === undefined ? 'undefined' : fmt(r);
          } catch (e) { out.className = 'dev-out err'; out.textContent = e.stack || String(e); }
        };
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } e.stopPropagation(); });
        tabs.panes.run.append(ta, el('div', { class: 'dem-btns dev-btns' }, [btn('Run (Ctrl+Enter)', run, 'primary')]), out);
      } });
  };
})();

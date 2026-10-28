/* AERIS-GIS — desktop-GIS widgets: icons, menus, windows, forms, tables, message bar, log */
(function () {
  'use strict';
  const U = AERIS.U, el = U.el;
  const UI = {};

  /* ---------------- icon set (24-unit viewBox) ---------------- */
  const I = {
    pan: '<path d="M8.5 12V6a1.4 1.4 0 0 1 2.8 0v5M11.3 11V4.6a1.4 1.4 0 0 1 2.8 0V11M14.1 11V5.6a1.4 1.4 0 0 1 2.8 0V12M16.9 9.5a1.4 1.4 0 0 1 2.8 0V15c0 3.6-2.6 6-6.1 6h-1.2c-2.4 0-4-1-5.3-3l-2.6-4.2a1.4 1.4 0 0 1 2.3-1.6L8.5 14" fill="#fff4dc" stroke="#6b5226" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>',
    zoomIn: '<circle cx="10" cy="10" r="6.5" fill="#e8f3ff" stroke="#2b5b8a" stroke-width="1.6"/><path d="M15 15l6 6" stroke="#7a5a28" stroke-width="3" stroke-linecap="round"/><path d="M6.8 10h6.4M10 6.8v6.4" stroke="#2e7d32" stroke-width="2"/>',
    zoomOut: '<circle cx="10" cy="10" r="6.5" fill="#e8f3ff" stroke="#2b5b8a" stroke-width="1.6"/><path d="M15 15l6 6" stroke="#7a5a28" stroke-width="3" stroke-linecap="round"/><path d="M6.8 10h6.4" stroke="#c62828" stroke-width="2"/>',
    zoomFull: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" fill="#e8f3ff" stroke="#2b5b8a" stroke-width="1.3"/><path d="M4.5 9.5v-5h5M14.5 4.5h5v5M19.5 14.5v5h-5M9.5 19.5h-5v-5" stroke="#2e7d32" stroke-width="2" fill="none"/>',
    zoomLayer: '<circle cx="10" cy="10" r="6.5" fill="#e8f3ff" stroke="#2b5b8a" stroke-width="1.6"/><path d="M15 15l6 6" stroke="#7a5a28" stroke-width="3" stroke-linecap="round"/><path d="M10 6.5l3.5 2-3.5 2-3.5-2z" fill="#6aa84f" stroke="#38761d" stroke-width=".8"/><path d="M6.5 11l3.5 2 3.5-2" fill="none" stroke="#38761d" stroke-width="1"/>',
    zoomVolcano: '<circle cx="10" cy="10" r="6.5" fill="#e8f3ff" stroke="#2b5b8a" stroke-width="1.6"/><path d="M15 15l6 6" stroke="#7a5a28" stroke-width="3" stroke-linecap="round"/><path d="M6.5 13l3.5-6 3.5 6z" fill="#d7301f"/>',
    refresh: '<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="#2b5b8a" stroke-width="2"/><path d="M17.5 3v4.5H13" fill="none" stroke="#2b5b8a" stroke-width="2"/>',
    identify: '<path d="M4 3l6.5 15 2-6 6-2z" fill="#fff" stroke="#333" stroke-width="1.2" stroke-linejoin="round"/><circle cx="17.5" cy="17.5" r="5" fill="#2b6cb0"/><rect x="16.8" y="16.5" width="1.4" height="4" fill="#fff"/><circle cx="17.5" cy="14.8" r=".9" fill="#fff"/>',
    measure: '<g transform="rotate(-35 12 12)"><rect x="1.5" y="8.5" width="21" height="7" rx="1" fill="#f5d76e" stroke="#8a6d1a" stroke-width="1.1"/><path d="M5 8.5v3M8 8.5v2M11 8.5v3M14 8.5v2M17 8.5v3M20 8.5v2" stroke="#6b5310" stroke-width="1"/></g>',
    table: '<rect x="3" y="4" width="18" height="16" fill="#fff" stroke="#555" stroke-width="1.2"/><rect x="3" y="4" width="18" height="4" fill="#9ec5ea"/><path d="M3 8h18M3 12h18M3 16h18M9 4v16M15 4v16" stroke="#8a8a8a" stroke-width=".9"/>',
    toolbox: '<circle cx="12" cy="12" r="8" fill="none" stroke="#589632" stroke-width="4" stroke-dasharray="3.1 3.18"/><circle cx="12" cy="12" r="6" fill="#589632"/><circle cx="12" cy="12" r="2.4" fill="#fff"/>',
    plume: '<path d="M2.5 21.5l6.5-9.5h6l6.5 9.5z" fill="#8d6e63" stroke="#5d4037" stroke-width=".8"/><path d="M9 12l1.2-1.6h3.6L15 12z" fill="#e64a19"/><circle cx="12" cy="7.2" r="3" fill="#b0bec5"/><circle cx="16.3" cy="5.4" r="2.6" fill="#cfd8dc"/><circle cx="20" cy="4.2" r="2" fill="#eceff1" stroke="#b0bec5" stroke-width=".6"/>',
    traj: '<path d="M3 20c4-1 5-8 9-9s6 3 9-5" fill="none" stroke="#e41a1c" stroke-width="2"/><path d="M17.8 5.4l3.4.4-.8 3.3" fill="none" stroke="#e41a1c" stroke-width="2"/><path d="M3 22c5 0 7-5 11-5s5-2 7-4" fill="none" stroke="#1f4fd6" stroke-width="1.6"/><path d="M11 10.4l1.8 1.1-.3 2-1.9-.7z" fill="#e41a1c"/>',
    backtraj: '<path d="M21 20c-4-1-5-8-9-9s-6 3-9-5" fill="none" stroke="#7b1fa2" stroke-width="2"/><path d="M6.2 5.4l-3.4.4.8 3.3" fill="none" stroke="#7b1fa2" stroke-width="2"/><rect x="18.5" y="17.5" width="4" height="5" rx="1" fill="#90a4ae" stroke="#455a64"/>',
    cansat: '<path d="M4.5 9.5a7.5 5.5 0 0 1 15 0z" fill="#ff7043" stroke="#bf360c" stroke-width="1"/><path d="M4.5 9.5l6 6.5M19.5 9.5l-6 6.5M12 9.5v6.5" stroke="#555" stroke-width=".8"/><rect x="9.8" y="15" width="4.4" height="7" rx="1" fill="#b0bec5" stroke="#455a64" stroke-width="1"/><path d="M9.8 17.5h4.4" stroke="#455a64" stroke-width=".8"/>',
    campaign: '<path d="M3 20h18" stroke="#555" stroke-width="1.4"/><path d="M5 20V9M9 20V6M13 20v-8M17 20V4" stroke="#1f77b4" stroke-width="2.6"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="#fff" stroke="#555" stroke-width="1.6"/><path d="M12 6.5V12l3.8 2.2" stroke="#c62828" stroke-width="2" fill="none" stroke-linecap="round"/>',
    save: '<path d="M3.5 3.5h14l3 3v14h-17z" fill="#4a7ab8" stroke="#2b4f80" stroke-width="1"/><rect x="7" y="3.5" width="9" height="6" fill="#e3edf7"/><rect x="6" y="13" width="12" height="7.5" fill="#fff"/><path d="M8 15.5h8M8 18h8" stroke="#9aa9bb"/>',
    open: '<path d="M2.5 6.5h7l2 2h10v11h-19z" fill="#f2c94c" stroke="#a07c1e" stroke-width="1"/><path d="M2.5 19.5l3-8h17l-3 8z" fill="#f9dc7a" stroke="#a07c1e" stroke-width="1"/>',
    layers: '<path d="M12 3.5l9 5-9 5-9-5z" fill="#6aa84f" stroke="#38761d" stroke-width="1"/><path d="M3 12.5l9 5 9-5" fill="none" stroke="#38761d" stroke-width="1.5"/><path d="M3 16.5l9 5 9-5" fill="none" stroke="#38761d" stroke-width="1.5"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="#2e7d32"/>',
    pause: '<rect x="6" y="5" width="4" height="14" fill="#2b5b8a"/><rect x="14" y="5" width="4" height="14" fill="#2b5b8a"/>',
    stepF: '<path d="M5 5v14l9-7z" fill="#555"/><rect x="15" y="5" width="3" height="14" fill="#555"/>',
    stepB: '<path d="M19 5v14l-9-7z" fill="#555"/><rect x="6" y="5" width="3" height="14" fill="#555"/>',
    first: '<path d="M20 5v14l-8-7z" fill="#555"/><path d="M12 5v14l-8-7z" fill="#555"/>',
    last: '<path d="M4 5v14l8-7z" fill="#555"/><path d="M12 5v14l8-7z" fill="#555"/>',
    log: '<path d="M3.5 4.5h17v12h-10l-5 4v-4h-2z" fill="#fff" stroke="#555" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 8.5h10M7 12h7" stroke="#2b6cb0" stroke-width="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9" fill="#e3f2fd" stroke="#1565c0" stroke-width="1.4"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18M4.5 7.5h15M4.5 16.5h15" fill="none" stroke="#1565c0" stroke-width="1"/>',
    brush: '<path d="M14.5 3.5l6 6-7.5 7.5-6-6z" fill="#f0c040" stroke="#8a6d1a" stroke-width="1"/><path d="M7 11l-3.5 7.5L11 15" fill="#8d6e63" stroke="#5d4037" stroke-width="1"/>',
    expand: '<rect x="4" y="4" width="16" height="16" fill="#fff" stroke="#666"/><path d="M8 12h8M12 8v8" stroke="#333" stroke-width="1.6"/>',
    collapse: '<rect x="4" y="4" width="16" height="16" fill="#fff" stroke="#666"/><path d="M8 12h8" stroke="#333" stroke-width="1.6"/>',
    wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7" fill="none" stroke="#2b6cb0" stroke-width="1.8" stroke-linecap="round"/>',
    search: '<circle cx="10" cy="10" r="6" fill="none" stroke="#555" stroke-width="1.8"/><path d="M14.5 14.5L20 20" stroke="#555" stroke-width="2.2" stroke-linecap="round"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6"/>',
    float: '<rect x="5" y="7" width="12" height="11" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7V4h12v11h-3" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    pick: '<circle cx="12" cy="12" r="6.5" fill="none" stroke="#c62828" stroke-width="1.6"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="#c62828" stroke-width="1.6"/>',
    help: '<circle cx="12" cy="12" r="9" fill="#2b6cb0"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.1" fill="#fff"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="#555" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="7" r="2.3" fill="#fff" stroke="#555" stroke-width="1.6"/><circle cx="8" cy="17" r="2.3" fill="#fff" stroke="#555" stroke-width="1.6"/>',
    // layer-type icons
    lPoint: '<circle cx="7" cy="8" r="2.6" fill="#e6550d" stroke="#7f2704"/><circle cx="16" cy="6" r="2.6" fill="#e6550d" stroke="#7f2704"/><circle cx="12" cy="16" r="2.6" fill="#e6550d" stroke="#7f2704"/>',
    lVolc: '<path d="M12 4l9 15H3z" fill="#d7301f" stroke="#7f0000" stroke-width="1"/>',
    lLine: '<path d="M3 18l5-9 5 6 8-10" fill="none" stroke="#1f4fd6" stroke-width="2" stroke-linejoin="round"/><circle cx="3" cy="18" r="1.6" fill="#1f4fd6"/><circle cx="21" cy="5" r="1.6" fill="#1f4fd6"/>',
    lPoly: '<path d="M4 7l8-4 8 5-2 11-11 1z" fill="#a1d99b" stroke="#31a354" stroke-width="1.4" stroke-linejoin="round"/>',
    lRaster: '<rect x="3" y="3" width="6" height="6" fill="#fed976"/><rect x="9" y="3" width="6" height="6" fill="#fd8d3c"/><rect x="15" y="3" width="6" height="6" fill="#f03b20"/><rect x="3" y="9" width="6" height="6" fill="#ffffb2"/><rect x="9" y="9" width="6" height="6" fill="#feb24c"/><rect x="15" y="9" width="6" height="6" fill="#fd8d3c"/><rect x="3" y="15" width="6" height="6" fill="#fff"/><rect x="9" y="15" width="6" height="6" fill="#ffffb2"/><rect x="15" y="15" width="6" height="6" fill="#fed976"/><rect x="3" y="3" width="18" height="18" fill="none" stroke="#777"/>',
    lGroup: '<path d="M2.5 6.5h7l2 2h10v11h-19z" fill="#f2c94c" stroke="#a07c1e" stroke-width="1"/>',
    lXYZ: '<circle cx="12" cy="12" r="9" fill="#cfe8cf" stroke="#2e7d32" stroke-width="1.3"/><path d="M5 8c3 1 4-2 7-1s2 4 5 3 2-3 3-2M4 14c3-1 5 2 8 1s4 2 7 1" fill="none" stroke="#2e7d32" stroke-width="1"/>',
    lParticles: '<g fill="#d7191c"><circle cx="5" cy="15" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="8" cy="17" r="1.4"/></g><g fill="#fd8d3c"><circle cx="13" cy="10" r="1.4"/><circle cx="12" cy="15" r="1.4"/></g><g fill="#1a9641"><circle cx="17" cy="7" r="1.4"/><circle cx="16" cy="12" r="1.4"/></g><circle cx="20" cy="5" r="1.4" fill="#2b83ba"/>',
    lMesh: '<path d="M3 20L12 4l9 16z M7.5 12h9M12 20V4M3 20l9-8 9 8" fill="#e3f2fd" stroke="#1565c0" stroke-width="1"/>'
  };
  UI.icon = (name, extra) => `<svg viewBox="0 0 24 24" ${extra || ''}>${I[name] || ''}</svg>`;
  UI.icons = I;

  /* ---------------- menus ---------------- */
  let openMenus = [];
  function closeMenus(level = 0) {
    while (openMenus.length > level) { const m = openMenus.pop(); m.el.remove(); if (m.owner) m.owner.classList.remove('open'); }
  }
  UI.closeMenus = () => closeMenus(0);
  function buildMenu(items, x, y, level, owner) {
    closeMenus(level);
    const m = el('div', { class: 'menu' });
    items.forEach((it) => {
      if (it === '-') { m.appendChild(el('div', { class: 'sep' })); return; }
      if (it.header) { m.appendChild(el('div', { class: 'mh', text: it.header })); return; }
      const disabled = typeof it.disabled === 'function' ? it.disabled() : !!it.disabled;
      const checked = typeof it.checked === 'function' ? it.checked() : it.checked;
      const ico = checked === true ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>'
        : checked === false ? '' : it.icon ? UI.icon(it.icon) : '';
      const row = el('div', { class: 'mi' + (disabled ? ' disabled' : ''), html:
        `<span class="ico">${ico}</span><span>${U.esc(it.label)}</span><span class="sc">${it.shortcut || ''}</span><span class="arr">${it.submenu ? '▸' : ''}</span>` });
      row.addEventListener('mouseenter', () => {
        closeMenus(level + 1);
        if (it.submenu && !disabled) {
          const r = row.getBoundingClientRect();
          row.classList.add('open');
          buildMenu(typeof it.submenu === 'function' ? it.submenu() : it.submenu, r.right - 2, r.top - 3, level + 1, row);
        }
      });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (disabled || it.submenu) return;
        closeMenus(0);
        document.querySelectorAll('#menubar .mb-item.open').forEach((n) => n.classList.remove('open'));
        it.action && it.action();
      });
      m.appendChild(row);
    });
    document.getElementById('menuLayer').appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(0, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    m.style.top = Math.max(0, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
    openMenus.push({ el: m, owner });
    return m;
  }
  UI.contextMenu = (x, y, items) => buildMenu(items, x, y, 0, null);

  UI.menubar = function (root, menus, brandHTML) {
    let active = false;
    menus.forEach((mdef) => {
      const it = el('div', { class: 'mb-item', text: mdef.label });
      const open = () => {
        document.querySelectorAll('#menubar .mb-item.open').forEach((n) => n.classList.remove('open'));
        it.classList.add('open');
        const r = it.getBoundingClientRect();
        buildMenu(typeof mdef.items === 'function' ? mdef.items() : mdef.items, r.left, r.bottom, 0, null);
      };
      it.addEventListener('click', (e) => { e.stopPropagation(); if (it.classList.contains('open')) { closeMenus(0); it.classList.remove('open'); active = false; } else { active = true; open(); } });
      it.addEventListener('mouseenter', () => { if (active && openMenus.length) open(); });
      root.appendChild(it);
    });
    if (brandHTML) root.appendChild(el('div', { class: 'mb-brand', html: brandHTML }));
    document.addEventListener('click', () => { closeMenus(0); active = false; document.querySelectorAll('#menubar .mb-item.open').forEach((n) => n.classList.remove('open')); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenus(0); active = false; document.querySelectorAll('#menubar .mb-item.open').forEach((n) => n.classList.remove('open')); } });
  };

  /* ---------------- floating windows ---------------- */
  const wins = {};
  let zTop = 10, cascade = 0;
  UI.window = function (o) {
    if (wins[o.id]) { wins[o.id].focus(); return wins[o.id]; }
    const layer = document.getElementById('windowLayer');
    const w = Math.min(o.width || 520, window.innerWidth - 20), h = Math.min(o.height || 400, window.innerHeight - 20);
    const x = o.x !== undefined ? o.x : Math.max(10, (window.innerWidth - w) / 2 + (cascade % 5) * 24 - 40);
    const y = o.y !== undefined ? o.y : Math.max(10, (window.innerHeight - h) / 2 + (cascade % 5) * 24 - 60);
    cascade++;
    const win = el('div', { class: 'win', style: { width: w + 'px', height: h + 'px', left: x + 'px', top: y + 'px' } });
    const title = el('div', { class: 'win-title', html: `<span class="wt-ico">${o.icon ? UI.icon(o.icon) : ''}</span><span class="wt-text">${U.esc(o.title)}</span>` });
    const bClose = el('button', { class: 'wt-btn', title: 'Close', html: '✕' });
    title.appendChild(bClose);
    const body = el('div', { class: 'win-body' });
    win.appendChild(title); win.appendChild(body);
    layer.appendChild(win);
    const api = {
      el: win, body,
      focus() { document.querySelectorAll('.win.focused').forEach((n) => n.classList.remove('focused')); win.classList.add('focused'); win.style.zIndex = ++zTop; },
      close() { if (o.onClose && o.onClose() === false) return; win.remove(); delete wins[o.id]; },
      setTitle(t) { title.querySelector('.wt-text').textContent = t; }
    };
    bClose.addEventListener('click', (e) => { e.stopPropagation(); api.close(); });
    win.addEventListener('mousedown', () => api.focus());
    let drag = null;
    title.addEventListener('mousedown', (e) => {
      if (e.target.closest('.wt-btn')) return;
      drag = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      win.style.left = U.clamp(e.clientX - drag.dx, -win.offsetWidth + 80, window.innerWidth - 80) + 'px';
      win.style.top = U.clamp(e.clientY - drag.dy, 0, window.innerHeight - 30) + 'px';
    });
    window.addEventListener('mouseup', () => { drag = null; });
    wins[o.id] = api;
    if (o.content) o.content(body, api);
    api.focus();
    return api;
  };
  UI.getWindow = (id) => wins[id];

  /* ---------------- tabs ---------------- */
  UI.tabs = function (container, tabs, onChange) {
    const bar = el('div', { class: 'wtabs' });
    const panes = {};
    let current = null;
    const select = (id) => {
      current = id;
      bar.querySelectorAll('.wtab').forEach((t) => t.classList.toggle('active', t.dataset.id === id));
      Object.entries(panes).forEach(([k, p]) => p.classList.toggle('hidden', k !== id));
      onChange && onChange(id);
    };
    tabs.forEach((t) => {
      const b = el('div', { class: 'wtab', text: t.label, 'data-id': t.id, onclick: () => select(t.id) });
      bar.appendChild(b);
      const p = el('div', { class: 'wpane' + (t.paneClass ? ' ' + t.paneClass : '') });
      panes[t.id] = p;
    });
    container.appendChild(bar);
    Object.values(panes).forEach((p) => container.appendChild(p));
    select(tabs[0].id);
    return { panes, select, get current() { return current; } };
  };

  /* ---------------- form builder ---------------- */
  UI.form = function (defs) {
    const root = el('div');
    const ctrls = {};
    function build(list, parent) {
      list.forEach((d) => {
        if (d.type === 'group') {
          const g = el('div', { class: 'fgroup' }, [el('div', { class: 'fgt', text: d.label })]);
          build(d.fields, g); parent.appendChild(g); return;
        }
        if (d.type === 'custom') { const c = d.render(); parent.appendChild(c); if (d.key) ctrls[d.key] = { get: d.get, set: d.set }; return; }
        if (d.type === 'html') { parent.appendChild(el('div', { class: 'hint', html: d.html, style: { margin: '0 0 8px' } })); return; }
        const f = el('div', { class: 'field' });
        if (d.type === 'checkbox') {
          const cb = el('input', { type: 'checkbox' }); cb.checked = !!d.value;
          if (d.onchange) cb.addEventListener('change', () => d.onchange(cb.checked));
          f.appendChild(el('label', { class: 'chk' }, [cb, el('span', { html: d.label })]));
          ctrls[d.key] = { get: () => cb.checked, set: (v) => { cb.checked = !!v; }, el: cb };
        } else {
          f.appendChild(el('label', { class: 'fl', html: d.label + (d.optional ? ' <span class="opt">[optional]</span>' : '') }));
          let inp;
          if (d.type === 'select') {
            inp = el('select');
            d.options.forEach((o) => { const op = el('option', { value: o.value, text: o.label }); if (String(o.value) === String(d.value)) op.selected = true; inp.appendChild(op); });
          } else {
            inp = el('input', { type: d.type === 'datetime' ? 'datetime-local' : d.type || 'text', step: d.step, min: d.min, max: d.max });
            inp.value = d.value !== undefined ? d.value : '';
          }
          if (d.onchange) inp.addEventListener('change', () => d.onchange(inp.value));
          if (d.button) {
            const b = el('button', { class: 'btn small', type: 'button', html: d.button.label, title: d.button.title || '', onclick: () => d.button.action(ctrls) });
            f.appendChild(el('div', { class: 'inl' }, [inp, b]));
          } else f.appendChild(inp);
          const num = d.type === 'number';
          ctrls[d.key] = { get: () => (num ? parseFloat(inp.value) : inp.value), set: (v) => { inp.value = v; }, el: inp };
        }
        if (d.hint) f.appendChild(el('div', { class: 'hint', html: d.hint }));
        parent.appendChild(f);
      });
    }
    build(defs, root);
    return {
      el: root, ctrls,
      values() { const o = {}; Object.entries(ctrls).forEach(([k, c]) => (o[k] = c.get())); return o; },
      set(k, v) { ctrls[k] && ctrls[k].set(v); }
    };
  };

  /* ---------------- processing-style algorithm dialog ---------------- */
  UI.algorithmDialog = function (o) {
    let running = false, cancelled = false;
    const api = UI.window({
      id: o.id, title: o.title, icon: o.icon, width: o.width || 820, height: o.height || 600,
      onClose: () => { if (running) { cancelled = true; } },
      content: (body, w) => {
        const tabs = UI.tabs(body, [{ id: 'params', label: 'Parameters' }, { id: 'log', label: 'Log' }]);
        const split = el('div', { class: 'algo-split' });
        const params = el('div', { class: 'algo-params' });
        const help = el('div', { class: 'algo-help', html: o.help || '' });
        split.appendChild(params); split.appendChild(help);
        tabs.panes.params.appendChild(split);
        tabs.panes.params.style.display = 'flex';
        const logEl = el('div', { class: 'algo-log' });
        tabs.panes.log.appendChild(logEl);
        const form = UI.form(o.fields);
        params.appendChild(form.el);
        const foot = el('div', { class: 'win-foot' });
        const prog = el('div', { class: 'progress', html: '<i></i><span></span>' });
        const bCancel = el('button', { class: 'btn', text: 'Cancel', disabled: true });
        const bRun = el('button', { class: 'btn primary', text: 'Run' });
        const bClose = el('button', { class: 'btn', text: 'Close' });
        foot.append(prog, bCancel, bRun, bClose);
        body.appendChild(foot);
        const log = (msg, cls) => { logEl.appendChild(el('div', { class: cls ? 'lg-' + cls : '', text: msg })); logEl.scrollTop = logEl.scrollHeight; };
        const setProg = (f, txt) => { prog.querySelector('i').style.width = (f * 100).toFixed(1) + '%'; prog.querySelector('span').textContent = txt !== undefined ? txt : f > 0 ? (f * 100).toFixed(0) + '%' : ''; };
        bClose.addEventListener('click', () => w.close());
        bCancel.addEventListener('click', () => { cancelled = true; log('Cancelling…', 'warn'); });
        bRun.addEventListener('click', async () => {
          if (running) return;
          running = true; cancelled = false;
          bRun.disabled = true; bCancel.disabled = false;
          tabs.select('log');
          const vals = form.values();
          log(`Algorithm '${o.title}' starting…`, 'head');
          log('Input parameters:\n' + JSON.stringify(o.logParams ? o.logParams(vals) : vals, null, 2));
          const t0 = performance.now();
          try {
            await o.run(vals, { log, progress: setProg, cancelled: () => cancelled });
            log(`Execution completed in ${((performance.now() - t0) / 1000).toFixed(2)} seconds`, 'ok');
            setProg(1, 'Complete');
            if (o.closeOnSuccess) setTimeout(() => w.close(), 400);
          } catch (e) {
            console.error(e);
            log('Execution failed: ' + e.message, 'err');
            setProg(0, 'Failed');
          } finally {
            running = false; bRun.disabled = false; bCancel.disabled = true;
          }
        });
        w.form = form; w.log = log;
      }
    });
    return api;
  };

  /* ---------------- data table (attribute-table style) ---------------- */
  UI.table = function (container, o) {
    const wrap = el('div', { class: 'at-wrap' });
    container.appendChild(wrap);
    let sortKey = null, sortDir = 1, rows = o.rows.slice(), selected = o.selected;
    function render() {
      const t = el('table', { class: 'grid' });
      const thead = el('tr', {}, [el('th', { class: 'rn', text: '' })]);
      o.columns.forEach((c) => {
        const th = el('th', { text: c.label, title: c.title || c.label });
        if (sortKey === c.key) th.className = 'sorted' + (sortDir < 0 ? ' desc' : '');
        th.addEventListener('click', () => {
          if (sortKey === c.key) sortDir = -sortDir; else { sortKey = c.key; sortDir = 1; }
          const val = (r) => (c.sort ? c.sort(r) : r[c.key]);
          rows.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
          render();
        });
        thead.appendChild(th);
      });
      t.appendChild(el('thead', {}, [thead]));
      const tb = el('tbody');
      rows.forEach((r, i) => {
        const tr = el('tr', { class: selected === r ? 'sel' : '' });
        tr.appendChild(el('td', { class: 'rn', text: String(i + 1) }));
        o.columns.forEach((c) => {
          const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
          const cls = [c.num ? 'num' : '', c.cls ? c.cls(r) : ''].join(' ').trim();
          tr.appendChild(el('td', { class: cls, html: v === null || v === undefined ? '<span class="muted">NULL</span>' : String(v) }));
        });
        tr.addEventListener('click', () => { selected = r; render(); o.onSelect && o.onSelect(r); });
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      wrap.innerHTML = '';
      wrap.appendChild(t);
    }
    render();
    return { setRows(r) { rows = r.slice(); render(); }, get count() { return rows.length; } };
  };

  /* ---------------- message bar (top of map canvas) ---------------- */
  UI.message = function (title, text, level = 'info', timeout = 7000, action) {
    const bar = document.getElementById('msgbar');
    const m = el('div', { class: 'msg ' + level, html: `<b>${U.esc(title)}</b><span>${text}</span>` });
    if (action) m.appendChild(el('button', { class: 'act', text: action.label, onclick: () => { action.run(); m.remove(); } }));
    m.appendChild(el('button', { class: 'x', html: '✕', title: 'Close', onclick: () => m.remove() }));
    bar.appendChild(m);
    while (bar.children.length > 3) bar.firstChild.remove();
    if (timeout) setTimeout(() => m.remove(), timeout);
    return m;
  };

  /* ---------------- log messages ---------------- */
  UI.logs = [];
  UI.log = function (msg, level = 'info', tab = 'General') {
    const entry = { t: new Date(), msg, level, tab };
    UI.logs.push(entry);
    const cnt = document.getElementById('sbLogCount');
    if (cnt) cnt.textContent = UI.logs.filter((l) => l.level !== 'info').length || '';
    const w = UI.getWindow('logwin');
    if (w && w.append) w.append(entry);
    const sb = document.getElementById('sbMsg');
    if (sb && level !== 'debug') sb.textContent = msg;
  };

  UI.status = function (text) { const sb = document.getElementById('sbMsg'); if (sb) sb.textContent = text; };
  UI.progress = function (f) {
    const p = document.getElementById('sbProgress');
    if (!p) return;
    if (f === null || f === undefined) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    p.querySelector('i').style.width = (f * 100).toFixed(1) + '%';
  };

  AERIS.ui = UI;
})();

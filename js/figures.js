/* AERIS-GIS — Figures & report (QGIS "Print Layout"-style). Every result becomes a numbered,
   publication-ready PNG figure with an auto-written caption: study-area map, plume maps, plume
   evolution panels, trajectories, town exposure, source attribution, CanSat 3D / plan-side views,
   landing dispersion on imagery, altitude trace, vertical profiles, regression table, LoRa link,
   wind profile, flight-window calendar, campaign summary and the met context at the vents. */
(function () {
  'use strict';
  const U = AERIS.U, D = AERIS.data, MET = AERIS.met, ML = AERIS.maplayers, UI = AERIS.ui, CS = AERIS.cansat, MODEL = AERIS.model;
  const A = AERIS.app, S = A.S, el = U.el, DEG = U.DEG;
  const F = AERIS.figures = {};
  const FONT = 'Arial, Helvetica, "Segoe UI", sans-serif';
  let snap3d = null;
  const rendered = {};          // id -> { url, caption, title }
  F.setSnapshot = (url, caption) => { snap3d = { url, caption }; delete rendered.cansat3d; const w = UI.getWindow('figures'); if (w && w.refresh) w.refresh(); };

  /* ============================== drawing helpers ============================== */
  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    return [c, g];
  }
  const bgPlugin = { id: 'figbg', beforeDraw: (c) => { const g = c.ctx; g.save(); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.restore(); } };
  function chartCanvas(cfg, w, h) {
    const [c] = canvas(w, h);
    const keep = { color: Chart.defaults.color, border: Chart.defaults.borderColor, size: Chart.defaults.font.size, family: Chart.defaults.font.family };
    Chart.defaults.color = '#222'; Chart.defaults.borderColor = 'rgba(0,0,0,0.13)';
    Chart.defaults.font.size = Math.round(Math.max(12, w / 72)); Chart.defaults.font.family = FONT;
    const opts = Object.assign({}, cfg.options || {}, { responsive: false, animation: false, devicePixelRatio: 1, maintainAspectRatio: false });
    const ch = new Chart(c.getContext('2d'), Object.assign({}, cfg, { options: opts, plugins: [bgPlugin].concat(cfg.plugins || []) }));
    const [out, g] = canvas(w, h);
    g.drawImage(c, 0, 0, w, h);
    ch.destroy();
    Object.assign(Chart.defaults, { color: keep.color, borderColor: keep.border });
    Chart.defaults.font.size = keep.size; Chart.defaults.font.family = keep.family;
    return out;
  }
  function halo(g, text, x, y, size, color = '#111', weight = '600', align = 'left') {
    g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'alphabetic';
    g.lineWidth = Math.max(2, size / 4); g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineJoin = 'round';
    g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
  }
  function tri(g, x, y, s, fill) { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.9, y + s * 0.6); g.lineTo(x - s * 0.9, y + s * 0.6); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke(); }
  function star(g, x, y, r, fill) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
  }
  const imgCache = new Map();
  function loadImg(url) {
    if (!imgCache.has(url)) imgCache.set(url, new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; }));
    return imgCache.get(url);
  }
  function wrap(g, text, x, y, maxW, lh) {
    const words = text.split(' '); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t;
    }
    if (line) g.fillText(line, x, y);
    return y + lh;
  }

  /* ---------- map renderer (Web-Mercator, tiles + overlays + furniture) ---------- */
  const wx = (lon) => (lon + 180) / 360 * 256;
  const wy = (lat) => { const r = lat * DEG; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256; };
  const iwy = (y) => (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * y / 256))) - Math.PI / 2) / DEG;
  async function mapCanvas(o) {
    const w = o.w, h = o.h;
    const m = { l: o.noAxes ? 8 : 74, r: o.noAxes ? 8 : 22, t: (o.title ? 46 : 14), b: o.noAxes ? 8 : 44 };
    const [c, g] = canvas(w, h);
    const FW = w - m.l - m.r, FH = h - m.t - m.b;
    const [[s, wst], [n, e]] = o.bounds;
    const x1 = wx(wst), x2 = wx(e), y1 = wy(n), y2 = wy(s);
    const z = Math.min(o.maxZoom || 19, Math.log2(Math.min(FW / (x2 - x1), FH / (y2 - y1))));
    const sc = 2 ** z, cx = (x1 + x2) / 2 * sc, cy = (y1 + y2) / 2 * sc;
    const P = (lat, lon) => [m.l + FW / 2 + wx(lon) * sc - cx, m.t + FH / 2 + wy(lat) * sc - cy];
    const lonAt = (px) => ((px - m.l - FW / 2 + cx) / sc) / 256 * 360 - 180;
    const latAt = (py) => iwy((py - m.t - FH / 2 + cy) / sc);
    // basemap
    const bm = ML.basemaps.find((b) => b.id === (o.basemap || 'esri-gray')) || ML.basemaps[0];
    const tz = Math.max(0, Math.min(o.tileMax || bm.max, Math.ceil(z - 0.15))), ts = 256 * 2 ** (z - tz);
    const X0 = Math.floor((cx - FW / 2) / ts), X1 = Math.floor((cx + FW / 2) / ts), Y0 = Math.floor((cy - FH / 2) / ts), Y1 = Math.floor((cy + FH / 2) / ts);
    g.save(); g.beginPath(); g.rect(m.l, m.t, FW, FH); g.clip();
    g.fillStyle = '#e8eef3'; g.fillRect(m.l, m.t, FW, FH);
    const jobs = [];
    for (let X = X0; X <= X1; X++) for (let Y = Y0; Y <= Y1; Y++) {
      const url = bm.url.replace('{s}', 'abc'[(X + Y) % 3]).replace('{z}', tz).replace('{x}', X).replace('{y}', Y).replace('{r}', '');
      jobs.push(loadImg(url).then((im) => ({ im, X, Y })));
    }
    (await Promise.all(jobs)).forEach(({ im, X, Y }) => { if (im) g.drawImage(im, m.l + FW / 2 + X * ts - cx, m.t + FH / 2 + Y * ts - cy, ts + 0.5, ts + 0.5); });
    if (o.fade) { g.fillStyle = `rgba(255,255,255,${o.fade})`; g.fillRect(m.l, m.t, FW, FH); }
    if (o.draw) await o.draw(g, P, { z, sc, FW, FH, m, lonAt, latAt });
    g.restore();
    // frame
    g.strokeStyle = '#111'; g.lineWidth = 1.5; g.strokeRect(m.l, m.t, FW, FH);
    // graticule ticks & labels
    if (!o.noAxes) {
      const lonSpan = lonAt(m.l + FW) - lonAt(m.l);
      const steps = [10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
      const st = steps.find((v) => lonSpan / v >= 3) || 0.001;
      const dec = st >= 1 ? 0 : st >= 0.1 ? 1 : st >= 0.01 ? 2 : 3;
      g.font = `${Math.round(w / 95)}px ${FONT}`; g.fillStyle = '#222'; g.strokeStyle = '#111'; g.lineWidth = 1;
      for (let lon = Math.ceil(lonAt(m.l) / st) * st; lon <= lonAt(m.l + FW); lon += st) {
        const x = P(0, lon)[0];
        g.beginPath(); g.moveTo(x, m.t + FH); g.lineTo(x, m.t + FH + 6); g.moveTo(x, m.t); g.lineTo(x, m.t - 5); g.stroke();
        g.textAlign = 'center'; g.fillText(U.fmtLon(lon, dec), x, m.t + FH + 8 + w / 95);
        if (o.gridLines) { g.save(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, m.t); g.lineTo(x, m.t + FH); g.stroke(); g.restore(); }
      }
      for (let lat = Math.ceil(latAt(m.t + FH) / st) * st; lat <= latAt(m.t); lat += st) {
        const y = P(lat, 0)[1];
        g.beginPath(); g.moveTo(m.l - 6, y); g.lineTo(m.l, y); g.moveTo(m.l + FW, y); g.lineTo(m.l + FW + 5, y); g.stroke();
        g.textAlign = 'right'; g.fillText(U.fmtLat(lat, dec), m.l - 9, y + 4);
        if (o.gridLines) { g.save(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(m.l, y); g.lineTo(m.l + FW, y); g.stroke(); g.restore(); }
      }
    }
    // title
    if (o.title) { g.font = `700 ${Math.round(w / 62)}px ${FONT}`; g.fillStyle = '#111'; g.textAlign = 'left'; g.fillText(o.title, m.l, 30); }
    // north arrow
    if (o.north !== false) {
      const ax = m.l + FW - 34, ay = m.t + 16, s2 = Math.max(16, w / 70);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + s2 * 0.45, ay + s2 * 1.5); g.lineTo(ax, ay + s2 * 1.15); g.lineTo(ax - s2 * 0.45, ay + s2 * 1.5); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 1.3; g.stroke();
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, ay + s2 * 1.15); g.lineTo(ax - s2 * 0.45, ay + s2 * 1.5); g.closePath(); g.fillStyle = '#111'; g.fill();
      halo(g, 'N', ax, ay + s2 * 1.5 + s2 * 0.85, s2 * 0.8, '#111', '700', 'center');
    }
    // scale bar
    if (o.scaleBar !== false) {
      const lat0 = latAt(m.t + FH / 2);
      const mpp = 40075016.686 * Math.cos(lat0 * DEG) / (256 * sc);
      const target = FW / 4 * mpp;
      const p10 = 10 ** Math.floor(Math.log10(target));
      const L = [1, 2, 2.5, 5, 10].map((k) => k * p10).filter((v) => v <= target).pop() || p10;
      const px = L / mpp, bx = m.l + 16, by = m.t + FH - 22, bh = 7;
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(bx - 8, by - 22, px + 60, 38);
      for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#fff' : '#111'; g.fillRect(bx + k * px / 4, by, px / 4, bh); }
      g.strokeStyle = '#111'; g.lineWidth = 1; g.strokeRect(bx, by, px, bh);
      const unit = L >= 1000 ? `${L / 1000} km` : `${L} m`;
      halo(g, '0', bx, by - 5, Math.round(w / 105), '#111', '400', 'center');
      halo(g, unit, bx + px, by - 5, Math.round(w / 105), '#111', '600', 'center');
    }
    // legend
    if (o.legend && o.legend.length) drawLegend(g, o.legend, m.l + FW - 12, m.t + FH - 12, w, o.legendTitle);
    // attribution
    g.font = `${Math.round(w / 150)}px ${FONT}`; g.fillStyle = 'rgba(0,0,0,.6)'; g.textAlign = 'right';
    g.fillText(`${bm.attr.replace(/<[^>]+>/g, '')}${o.attr ? ' · ' + o.attr : ''}`, m.l + FW - 4, m.t + FH + (o.noAxes ? -4 : 36));
    return { canvas: c, P, m, FW, FH, z };
  }
  function drawLegend(g, items, xr, yb, w, title) {
    const fs = Math.round(w / 100), lh = fs * 1.55, pad = 10;
    g.font = `${fs}px ${FONT}`;
    const tw = Math.max(title ? g.measureText(title).width + 10 : 0, ...items.map((it) => g.measureText(it.label).width)) + 44;
    const hgt = items.length * lh + pad * 2 + (title ? lh : 0);
    const x0 = xr - tw - pad, y0 = yb - hgt;
    g.fillStyle = 'rgba(255,255,255,.93)'; g.fillRect(x0, y0, tw + pad, hgt);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(x0, y0, tw + pad, hgt);
    let y = y0 + pad + fs;
    if (title) { g.font = `700 ${fs}px ${FONT}`; g.fillStyle = '#111'; g.textAlign = 'left'; g.fillText(title, x0 + pad, y); y += lh; g.font = `${fs}px ${FONT}`; }
    items.forEach((it) => {
      const sx = x0 + pad, sy = y - fs * 0.8;
      if (it.type === 'box') { g.fillStyle = it.color; g.globalAlpha = it.alpha || 1; g.fillRect(sx, sy, 26, fs); g.globalAlpha = 1; g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeRect(sx, sy, 26, fs); }
      else if (it.type === 'line') { g.strokeStyle = it.color; g.lineWidth = it.width || 3; g.setLineDash(it.dash || []); g.beginPath(); g.moveTo(sx, sy + fs / 2); g.lineTo(sx + 26, sy + fs / 2); g.stroke(); g.setLineDash([]); }
      else if (it.type === 'tri') tri(g, sx + 13, sy + fs * 0.55, fs * 0.6, it.color);
      else if (it.type === 'star') star(g, sx + 13, sy + fs / 2, fs * 0.6, it.color);
      else { g.beginPath(); g.arc(sx + 13, sy + fs / 2, fs * 0.35, 0, 7); g.fillStyle = it.color; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
      g.fillStyle = '#111'; g.textAlign = 'left'; g.fillText(it.label, sx + 34, y);
      y += lh;
    });
  }

  /* ---------- overlay painters ---------- */
  async function drawRaster(g, P, grid, arr, classes, ramp, alpha, continuous = true) {
    const r = ML.rasterURL(grid, arr, classes, ramp, continuous);
    const im = await loadImg(r.url);
    if (!im) return;
    const [[s, w], [n, e]] = r.bounds, [xa, ya] = P(n, w), [xb, yb] = P(s, e);
    g.globalAlpha = alpha; g.imageSmoothingEnabled = true; g.drawImage(im, xa, ya, xb - xa, yb - ya); g.globalAlpha = 1;
  }
  function drawContours(g, P, grid, arr, classes, ramp, filled) {
    const fc = ML.contours(grid, arr, classes);
    fc.features.forEach((f) => {
      const c = ramp[f.properties.cls];
      g.beginPath();
      f.geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(([lo, la], i) => { const [x, y] = P(la, lo); if (i) g.lineTo(x, y); else g.moveTo(x, y); })));
      if (filled) { g.fillStyle = c; g.globalAlpha = 0.45; g.fill('evenodd'); g.globalAlpha = 1; }
      const [r0, g0, b0] = ML.hex2rgb(c); g.strokeStyle = `rgb(${r0 * 0.6 | 0},${g0 * 0.6 | 0},${b0 * 0.6 | 0})`; g.lineWidth = 1.6; g.stroke();
    });
  }
  function drawVolcanoes(g, P, w, filter) {
    D.volcanoes.filter(filter || (() => true)).forEach((v) => {
      const [x, y] = P(v.lat, v.lon);
      tri(g, x, y, v.priority ? w / 90 : w / 150, v.priority ? '#d7301f' : v.status === 'Active' ? '#f16913' : '#a0785a');
      halo(g, v.name, x + w / 110, y - w / 160, v.priority ? Math.round(w / 78) : Math.round(w / 110), v.priority ? '#7f0000' : '#333', v.priority ? '700' : '600');
    });
  }
  function drawTowns(g, P, w, names) {
    D.receptors.filter((r) => !names || names.includes(r.name)).forEach((r) => {
      const [x, y] = P(r.lat, r.lon);
      g.beginPath(); g.arc(x, y, w / 330 + 1.5, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#222'; g.stroke();
      halo(g, r.name, x + 6, y - 5, Math.round(w / 125), '#222', '400');
    });
  }
  function drawSite(g, P, w, label = true) {
    const [x, y] = P(S.cfg.site.lat, S.cfg.site.lon);
    star(g, x, y, w / 85, '#1565c0');
    if (label) halo(g, 'CanSat site (Mainit / Toyozu)', x + w / 70, y + w / 160, Math.round(w / 100), '#0d47a1', '700');
  }
  function drawTraj(g, P, list, w, dashed) {
    list.forEach((t) => {
      if (t.pts.length < 2) return;
      g.setLineDash(dashed ? [10, 6] : []);
      g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath(); t.pts.forEach((p, i) => { const [x, y] = P(p.lat, p.lon); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      g.lineWidth = 2.8; g.strokeStyle = t.color; g.stroke();
      g.setLineDash([]);
      t.pts.forEach((p, i) => {
        const hrs = Math.abs(p.t - t.pts[0].t) / 3600e3;
        if (i && Math.abs(hrs % 6) < 1e-6) {
          const [x, y] = P(p.lat, p.lon), s = w / 170;
          g.fillStyle = t.color; g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath();
          if (t.shape === 'square') g.rect(x - s, y - s, 2 * s, 2 * s);
          else if (t.shape === 'circle') g.arc(x, y, s, 0, 7);
          else { g.moveTo(x, y - s * 1.2); g.lineTo(x + s, y + s * 0.8); g.lineTo(x - s, y + s * 0.8); g.closePath(); }
          g.fill(); g.stroke();
        }
      });
    });
  }
  function boundsOf(pts, padDeg, min = 0.2) {
    let s = 90, n = -90, w = 180, e = -180;
    pts.forEach(([la, lo]) => { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); });
    const cy = (s + n) / 2, cx = (w + e) / 2, hy = Math.max((n - s) / 2 + padDeg, min / 2), hx = Math.max((e - w) / 2 + padDeg, min / 2);
    return [[cy - hy, cx - hx], [cy + hy, cx + hx]];
  }
  function concLegend(spId, withNotes = true) {
    const s = D.species[spId], ramp = D.ramps[S.style.ramp], u = D.mixUnit(spId);
    return s.classes.map((c, i) => ({ type: 'box', color: ramp[i], alpha: 0.85, label: `≥ ${U.fmtSig(D.toMixing(spId, c))} ${u} (${U.fmtSig(c)} µg/m³)${withNotes && s.notes[c] ? ' — ' + s.notes[c] : ''}` }));
  }
  const periodText = (R) => `${U.fmtPHT(R.params.startMs, true)} to ${U.fmtPHT(R.params.startMs + R.params.hours * 3600e3, true)}`;
  const srcText = (R) => R.sources.map((x) => `${x.name} (${x.rate} t/d)`).join(' and ');
  const metText = () => (MET.source === 'open-meteo' ? `${(MET.MODELS[MET.model] || MET.model).split(' (')[0]}${MET.periodQuery().hist ? ' archived' : ''} meteorology (Open-Meteo)` : 'climatological winds (offline fallback)');
  function plumeBounds(R) {
    const s = D.species[R.species], pts = R.sources.map((x) => [x.lat, x.lon]).concat([[S.cfg.site.lat, S.cfg.site.lon]]);
    const { nx, ny, res, lon0, latN } = R.grid;
    for (let j = 0; j < ny; j += 2) for (let i = 0; i < nx; i += 2) if (R.maxConc[j * nx + i] >= s.classes[0]) pts.push([latN - (j + 0.5) * res, lon0 + (i + 0.5) * res]);
    return boundsOf(pts, 0.15, 0.6);
  }

  /* ============================== figure definitions ============================== */
  const R_ = () => A.activeResult();
  const DEFS = [
    { id: 'study', title: 'Study area', need: () => true, async render(W) {
      const b = [[5.55, 123.95], [8.95, 127.0]];
      const map = await mapCanvas({ w: W, h: Math.round(W * 0.78), bounds: b, basemap: 'esri-topo', fade: 0.12, gridLines: true, title: 'Study area — priority volcanoes and the AERIS CanSat field site',
        legend: [{ type: 'tri', color: '#d7301f', label: 'Priority volcano (Mt. Apo, Mt. Leonard Kniaseff)' }, { type: 'tri', color: '#f16913', label: 'Other PHIVOLCS active volcano' },
          { type: 'star', color: '#1565c0', label: 'CanSat launch site' }, { type: 'dot', color: '#fff', label: 'Receptor town' }],
        draw: (g, P) => {
          drawTowns(g, P, W, ['Davao City', 'Digos', 'Kidapawan', 'Tagum', 'Nabunturan', 'Mati', 'General Santos', 'Cagayan de Oro', 'Malaybalay', 'Butuan', 'Cotabato City', 'Maragusan', 'New Bataan', 'Compostela', 'Maco']);
          drawVolcanoes(g, P, W);
          drawSite(g, P, W);
          const [ax, ay] = P(D.volcanoById('leonard').lat, D.volcanoById('leonard').lon), [bx, by] = P(S.cfg.site.lat, S.cfg.site.lon);
          g.setLineDash([6, 4]); g.strokeStyle = '#0d47a1'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
        } });
      // inset: Philippines with study-area box
      const iw = Math.round(W * 0.2), ih = Math.round(iw * 1.45);
      const inset = await mapCanvas({ w: iw, h: ih, bounds: [[4.5, 116.8], [20.8, 127.2]], basemap: 'esri-gray', noAxes: true, north: false, scaleBar: false,
        draw: (g, P) => { const [x1, y1] = P(b[1][0], b[0][1]), [x2, y2] = P(b[0][0], b[1][1]); g.strokeStyle = '#d32f2f'; g.lineWidth = 2.5; g.strokeRect(x1, y1, x2 - x1, y2 - y1); halo(g, 'Philippines', iw / 2, ih * 0.1, Math.round(iw / 12), '#111', '700', 'center'); } });
      const g = map.canvas.getContext('2d');
      const ix = map.m.l + 12, iy = map.m.t + 12;
      g.drawImage(inset.canvas, ix, iy); g.strokeStyle = '#111'; g.lineWidth = 1.5; g.strokeRect(ix, iy, iw, ih);
      return map.canvas;
    }, caption: () => `Study area. PHIVOLCS-listed volcanoes of Mindanao with the two priority sources, Mt. Apo (2,954 m) and Mt. Leonard Kniaseff (1,190 m), selected receptor towns, and the AERIS CanSat field site at ${D.site.name} (${U.fmtLL(S.cfg.site.lat, S.cfg.site.lon, 4)}), ${(U.haversine(S.cfg.site.lat, S.cfg.site.lon, 7.3817, 126.0467) / 1000).toFixed(0)} km north of Mt. Leonard Kniaseff (dashed line). Inset: location within the Philippines.` },

    { id: 'plumeMax', title: 'Maximum concentration map', need: () => !!R_(), async render(W) {
      const R = R_(), s = D.species[R.species], ramp = D.ramps[S.style.ramp];
      const map = await mapCanvas({ w: W, h: Math.round(W * 0.72), bounds: plumeBounds(R), basemap: 'esri-gray', title: `Maximum ${R.outH || 1}-h mean ${s.label}, 0–${R.params.layerTop} m AGL (${periodText(R)})`,
        legend: concLegend(R.species).concat([{ type: 'tri', color: '#d7301f', label: 'Source volcano' }, { type: 'star', color: '#1565c0', label: 'CanSat site' }]), legendTitle: `${s.label} maximum`, attr: metText(),
        draw: async (g, P) => {
          await drawRaster(g, P, R.grid, R.maxConc, s.classes, ramp, 0.78);
          drawContours(g, P, R.grid, R.maxConc, s.classes, ramp, false);
          const top = R.receptors.filter((r) => r.max >= s.classes[0]).map((r) => r.name);
          drawTowns(g, P, W, top.length ? top : ['Davao City', 'Tagum', 'Nabunturan']);
          drawVolcanoes(g, P, W, (v) => v.priority || R.sources.some((x) => x.id === v.id));
          drawSite(g, P, W);
        } });
      return map.canvas;
    }, caption: () => {
      const R = R_(), s = D.species[R.species];
      const top = R.receptors.filter((r) => r.max >= s.classes[0]).sort((a, b) => b.max - a.max).slice(0, 3);
      return `Maximum ${R.outH || 1}-hour mean ${s.name} (${s.label}) concentration in the 0–${R.params.layerTop} m AGL layer forecast by the HYSPLIT-style Lagrangian model for ${periodText(R)}, with emissions from ${srcText(R)} and ${metText()}. Peak ${A.fmtConc(R.species, R.peak, true)}. ${top.length ? `Most exposed towns: ${top.map((r) => `${r.name} (${A.fmtConc(R.species, r.max)})`).join(', ')}.` : 'No town exceeds the lowest class.'} Contours mark ${s.classes.map((c) => U.fmtSig(D.toMixing(R.species, c))).join(', ')} ${D.mixUnit(R.species)}. Emission rates are scenario values.`;
    } },

    { id: 'plumePanels', title: 'Plume evolution (4 panels)', need: () => !!R_() && R_().frames.length >= 4, async render(W) {
      const R = R_(), s = D.species[R.species], ramp = D.ramps[S.style.ramp], nf = R.frames.length;
      const idx = [0.25, 0.5, 0.75, 1].map((f) => Math.max(0, Math.round(nf * f) - 1));
      const pw = Math.round(W / 2), ph = Math.round(pw * 0.72), b = plumeBounds(R);
      const [c, g] = canvas(W, ph * 2 + 90);
      for (let k = 0; k < 4; k++) {
        const fi = idx[k], fr = R.frames[fi], sn = R.snaps[fi];
        const mp = await mapCanvas({ w: pw, h: ph, bounds: b, basemap: 'esri-gray', scaleBar: k === 0, north: k === 0, title: `(${'abcd'[k]}) ${U.fmtPHT(fr.t, true)}  (+${Math.round((fr.t - R.params.startMs) / 3600e3)} h)`,
          draw: async (gg, P) => {
            await drawRaster(gg, P, R.grid, fr.conc, s.classes, ramp, 0.75);
            drawContours(gg, P, R.grid, fr.conc, s.classes, ramp, false);
            if (sn) for (let i = 0; i < sn.lat.length; i += 2) { const [x, y] = P(sn.lat[i], sn.lon[i]); const hc = D.heightClasses.find((h) => sn.z[i] < h.max) || D.heightClasses[4]; gg.fillStyle = hc.color; gg.fillRect(x - 1, y - 1, 2, 2); }
            drawVolcanoes(gg, P, pw * 0.8, (v) => R.sources.some((x) => x.id === v.id));
            drawSite(gg, P, pw * 0.8, false);
          } });
        g.drawImage(mp.canvas, (k % 2) * pw, Math.floor(k / 2) * ph);
      }
      // shared legend strip
      const y0 = ph * 2 + 20, fs = Math.round(W / 90);
      g.font = `${fs}px ${FONT}`; g.fillStyle = '#111'; g.textAlign = 'left';
      g.fillText(`${s.label} (${D.mixUnit(R.species)}):`, 20, y0 + fs);
      let x = 20 + g.measureText(`${s.label} (${D.mixUnit(R.species)}):`).width + 14;
      s.classes.forEach((cl, i) => { g.fillStyle = ramp[i]; g.fillRect(x, y0, 36, fs * 1.2); g.strokeStyle = '#555'; g.strokeRect(x, y0, 36, fs * 1.2); g.fillStyle = '#111'; g.fillText(`≥${U.fmtSig(D.toMixing(R.species, cl))}`, x + 42, y0 + fs); x += 42 + g.measureText(`≥${U.fmtSig(D.toMixing(R.species, cl))}`).width + 18; });
      x += 10; g.fillText('Particles (m AGL):', x, y0 + fs); x += g.measureText('Particles (m AGL):').width + 10;
      D.heightClasses.forEach((h) => { g.fillStyle = h.color; g.beginPath(); g.arc(x + 6, y0 + fs * 0.6, 6, 0, 7); g.fill(); g.fillStyle = '#111'; const t = h.label.split(' (')[0]; g.fillText(t, x + 16, y0 + fs); x += 26 + g.measureText(t).width; });
      return c;
    }, caption: () => { const R = R_(); return `Evolution of the ${D.species[R.species].label} plume from ${srcText(R)}: ${R.outH || 1}-h mean concentration (0–${R.params.layerTop} m AGL, colours and contours) and model particles coloured by height above ground at (a) 25 %, (b) 50 %, (c) 75 % and (d) 100 % of the ${R.params.hours}-h run. Particles above the mixed layer (orange–blue) travel without reaching the ground.`; } },

    { id: 'traj', title: 'Forward trajectories + height panel', need: () => !!(S.traj && S.traj.length), async render(W) {
      const T = S.traj, pts = []; T.forEach((t) => t.pts.forEach((p) => pts.push([p.lat, p.lon])));
      const mh = Math.round(W * 0.6);
      const map = await mapCanvas({ w: W, h: mh, bounds: boundsOf(pts, 0.2, 1), basemap: 'esri-gray', title: `Forward trajectories from ${[...new Set(T.map((t) => t.origin))].join(' and ')} — start ${U.fmtPHT(T[0].pts[0].t, true)}`,
        legend: [...new Set(T.map((t) => t.height))].map((h) => { const t = T.find((x) => x.height === h); return { type: 'line', color: t.color, label: `${h} m above vent` }; }).concat([{ type: 'dot', color: '#555', label: 'Markers every 6 h' }]),
        draw: (g, P) => { drawTraj(g, P, T, W, false); drawVolcanoes(g, P, W, (v) => T.some((t) => t.originId === v.id)); drawSite(g, P, W); } });
      const chart = chartCanvas({ type: 'line', data: { datasets: T.map((t) => ({ label: `${t.origin} — ${t.height} m`, data: t.pts.map((p) => ({ x: (p.t - t.pts[0].t) / 3600e3, y: p.zAGL })), borderColor: t.color, borderWidth: 2.2, pointRadius: 0, borderDash: t.originId === 'apo' ? [8, 4] : [] })) },
        options: { plugins: { legend: { position: 'right' }, title: { display: true, text: 'Trajectory height above ground (HYSPLIT-style vertical panel)' } }, scales: { x: { type: 'linear', title: { display: true, text: 'Hours after start' } }, y: { title: { display: true, text: 'Height AGL (m)' }, beginAtZero: true } } } }, W, Math.round(W * 0.3));
      const [c, g] = canvas(W, mh + chart.height);
      g.drawImage(map.canvas, 0, 0); g.drawImage(chart, 0, mh);
      return c;
    }, caption: () => `Forward trajectories (mean-wind paths, no turbulence) from the priority vents starting at ${[...new Set(S.traj.map((t) => t.height))].join(', ')} m above each vent, computed with the Petterssen scheme on ${metText()}. Symbols every 6 h. The lower panel shows each parcel's height above ground; parcels that stay above the mixed layer carry gas far without surface impact (dashed: Mt. Apo).` },

    { id: 'receptors', title: 'Town exposure time series', need: () => !!R_() && R_().receptors.some((r) => r.max >= D.species[R_().species].classes[0]), render(W) {
      const R = R_(), s = D.species[R.species], u = D.mixUnit(R.species);
      const top = R.receptors.filter((r) => r.max >= s.classes[0]).sort((a, b) => b.max - a.max).slice(0, 6);
      const cols = ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e', '#8c564b'];
      const lbl = R.frames.map((f) => U.fmtPHT(f.t, true).slice(5, 16));
      const ymax = Math.max(...top.map((r) => D.toMixing(R.species, r.max)));
      const guides = s.classes.filter((c) => s.notes[c] && D.toMixing(R.species, c) <= ymax * 1.6);
      return chartCanvas({ type: 'line', data: { labels: lbl, datasets: top.map((r, i) => ({ label: r.name, data: r.series.map((v) => (v === null ? null : D.toMixing(R.species, v))), borderColor: cols[i], backgroundColor: cols[i], borderWidth: 2.4, pointRadius: 0, tension: 0.2 }))
        .concat(guides.map((c) => ({ label: s.notes[c], data: lbl.map(() => D.toMixing(R.species, c)), borderColor: '#555', borderDash: [6, 5], borderWidth: 1.4, pointRadius: 0 }))) },
        options: { plugins: { title: { display: true, text: `${s.label} ${R.outH || 1}-h mean at the most exposed towns (${u})` }, legend: { position: 'bottom' } },
          scales: { x: { title: { display: true, text: 'Time (PHT)' }, ticks: { maxTicksLimit: 14, maxRotation: 45 } }, y: { title: { display: true, text: `${s.label} (${u})` }, beginAtZero: true } } } }, W, Math.round(W * 0.55));
    }, caption: () => { const R = R_(); return `Modelled ${D.species[R.species].label} time series (${R.outH || 1}-h means, 0–${R.params.layerTop} m AGL) at the towns with the highest concentrations during ${periodText(R)}. Dashed lines: guideline values (WHO 2021, DENR NAAQGV); these are 24-h/annual standards, shown for context only.`; } },

    { id: 'attrib', title: 'Source attribution (backward trajectories)', need: () => !!(S.back && S.back.length), async render(W) {
      const B = S.back, pts = [[S.cfg.site.lat, S.cfg.site.lon]]; B.forEach((t) => t.pts.forEach((p) => pts.push([p.lat, p.lon])));
      D.volcanoes.filter((v) => v.priority).forEach((v) => pts.push([v.lat, v.lon]));
      const map = await mapCanvas({ w: W, h: Math.round(W * 0.7), bounds: boundsOf(pts, 0.15, 0.8), basemap: 'esri-gray', title: `Backward trajectories arriving at the CanSat site — ${U.fmtPHT(B[0].pts[0].t, true)}`,
        legend: B.map((t) => ({ type: 'line', color: t.color, dash: [8, 5], label: `${t.height} m AGL at the site` })).concat([{ type: 'tri', color: '#d7301f', label: 'Priority volcano' }]),
        draw: (g, P) => { drawTraj(g, P, B, W, true); drawVolcanoes(g, P, W, (v) => v.priority || S.attribution.some((a) => a.volcanoId === v.id)); drawSite(g, P, W); drawTowns(g, P, W, ['Nabunturan', 'Tagum', 'Davao City', 'Maragusan', 'Compostela']); } });
      return map.canvas;
    }, caption: () => { const a = (S.attribution || [])[0]; return `Backward trajectories ending at the CanSat site at the planned release time, used to attribute gases sampled during the descent. ${a ? `The ${a.height} m AGL trajectory passed ${a.distKm.toFixed(1)} km from ${a.volcano} ${a.hoursBefore.toFixed(0)} h before arrival (parcel at ${U.fmtNum(a.zMSL)} m MSL), so a volcanic signal from that source is plausible.` : 'No trajectory passed within 25 km of a volcano, so any gas detected is attributed to the local hot-spring vents or the regional background.'}`; } },

    { id: 'cansat3d', title: 'CanSat deployment — 3D view', need: () => !!snap3d, async render(W) {
      const im = await loadImg(snap3d.url); const h = Math.round(W * im.height / im.width);
      const [c, g] = canvas(W, h); g.drawImage(im, 0, 0, W, h); return c;
    }, caption: () => snap3d.caption, hint: 'Open the 3D view and press “📷 Save figure”.' },

    { id: 'planSide', title: 'CanSat descent — plan & side view', need: () => !!S.cs, render(W) {
      const r = S.cs, mc = S.mc, c = S.cfg;
      const brg = mc.meanBrg * DEG, ux = Math.sin(brg), uy = Math.cos(brg);
      const [gx, gy] = U.llToLocal(c.site.lat, c.site.lon, c.gs.lat, c.gs.lon), [vx, vy] = U.llToLocal(c.site.lat, c.site.lon, c.vent.lat, c.vent.lon);
      const desc = r.track.filter((p) => p.t >= r.tRel - 0.5), asc = r.track.filter((p) => p.t <= r.tRel);
      const R2 = Math.ceil(Math.max(60, mc.maxDist * 1.15, Math.hypot(gx, gy) + 15, ...mc.exclusionXY.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)) + 8)) / 10) * 10;
      const plan = chartCanvas({ type: 'scatter', data: { datasets: [
        { label: 'Exclusion zone', data: mc.exclusionXY.concat([mc.exclusionXY[0]]).map(([x, y]) => ({ x, y })), showLine: true, borderColor: '#e53935', borderDash: [7, 5], borderWidth: 1.8, pointRadius: 0, fill: false },
        { label: '95 % landing ellipse', data: mc.ellipseXY.map(([x, y]) => ({ x, y })), showLine: true, borderColor: '#6a1b9a', borderWidth: 2, pointRadius: 0 },
        { label: `Monte-Carlo landings (n=${mc.points.length})`, data: mc.points.map(([x, y]) => ({ x, y })), backgroundColor: 'rgba(106,27,154,.35)', pointRadius: 2.5 },
        { label: 'Simulated descent track', data: desc.map((p) => ({ x: p.x, y: p.y })), showLine: true, borderColor: '#263238', borderWidth: 2.4, pointRadius: 0 },
        { label: 'Launch', data: [{ x: 0, y: 0 }], pointStyle: 'triangle', pointRadius: 10, backgroundColor: '#1565c0' },
        { label: 'Ground station', data: [{ x: gx, y: gy }], pointStyle: 'rectRot', pointRadius: 9, backgroundColor: '#2e7d32' },
        { label: 'Hot-spring vent', data: [{ x: vx, y: vy }], pointStyle: 'rect', pointRadius: 8, backgroundColor: '#b8860b' },
        { label: 'Landing', data: [{ x: r.landing.x, y: r.landing.y }], pointStyle: 'crossRot', pointRadius: 12, borderColor: '#000', borderWidth: 2.5 }
      ] }, options: { plugins: { title: { display: true, text: `(a) Plan view — drift ${U.compass(mc.meanBrg)} ${mc.meanDist.toFixed(0)} m (mean)` }, legend: { position: 'bottom', labels: { boxWidth: 14 } } },
        scales: { x: { min: -R2, max: R2, title: { display: true, text: 'East of launch (m)' } }, y: { min: -R2, max: R2, title: { display: true, text: 'North of launch (m)' } } } } }, Math.round(W / 2), Math.round(W / 2));
      const along = (x, y) => x * ux + y * uy;
      const side = chartCanvas({ type: 'scatter', data: { datasets: mc.paths.slice(0, 40).map((pp, i) => ({ label: i ? '' : 'Monte-Carlo descents', data: pp.map(([x, y, z]) => ({ x: along(x, y), y: z })), showLine: true, borderColor: 'rgba(126,87,194,.25)', borderWidth: 1, pointRadius: 0 }))
        .concat([{ label: 'Ascent (drone)', data: asc.map((p) => ({ x: along(p.x, p.y), y: p.z })), showLine: true, borderColor: '#8e44ad', borderDash: [5, 4], borderWidth: 2, pointRadius: 0 },
          { label: 'Descent', data: desc.map((p) => ({ x: along(p.x, p.y), y: p.z })), showLine: true, borderColor: '#d32f2f', borderWidth: 2.6, pointRadius: 0 },
          { label: '1 Hz packets', data: r.recs.filter((p) => p.phase === 'DESCENT' || p.phase === 'RELEASE').map((p) => ({ x: along(p.x, p.y), y: p.altTrue })), backgroundColor: r.recs.filter((p) => p.phase === 'DESCENT' || p.phase === 'RELEASE').map((p) => (p.rx ? '#2e7d32' : '#d32f2f')), pointRadius: 4 }]) },
        options: { plugins: { title: { display: true, text: `(b) Side view along the drift direction (${mc.meanBrg.toFixed(0)}°)` }, legend: { position: 'bottom', labels: { boxWidth: 14, filter: (it) => !!it.text } } },
          scales: { x: { title: { display: true, text: 'Distance downwind of launch (m)' } }, y: { min: 0, max: Math.ceil((c.releaseAGL + 10) / 10) * 10, title: { display: true, text: 'Height AGL (m)' } } } } }, Math.round(W / 2), Math.round(W / 2));
      const [cv, g] = canvas(W, Math.round(W / 2)); g.drawImage(plan, 0, 0); g.drawImage(side, Math.round(W / 2), 0); return cv;
    }, caption: () => { const r = S.cs, mc = S.mc; return `Simulated CanSat descent on ${U.fmtPHT(S.cfg.flightTime, true)}. (a) Plan view with the simulated track, ${mc.points.length} Monte-Carlo landing points, 95 % landing ellipse (${mc.a.toFixed(0)} × ${mc.b.toFixed(0)} m) and the ${S.cfg.exclusion}-m-buffered exclusion zone. (b) Side view along the mean drift direction (${U.compass(mc.meanBrg)}): release at ${S.cfg.releaseAGL} m AGL, descent at ${r.stats.descentRate.toFixed(2)} m/s over ${r.descentTime.toFixed(1)} s (${r.stats.descentSamples} samples at 1 Hz); green/red dots are LoRa packets received/lost.`; } },

    { id: 'landingMap', title: 'Landing dispersion on satellite imagery', need: () => !!S.cs, async render(W) {
      const r = S.cs, mc = S.mc, c = S.cfg;
      const pts = [[c.site.lat, c.site.lon], [c.gs.lat, c.gs.lon], [c.vent.lat, c.vent.lon]].concat(mc.exclusionLL);
      const map = await mapCanvas({ w: W, h: Math.round(W * 0.72), bounds: boundsOf(pts, 0.0004, 0.004), basemap: 'esri-img', maxZoom: 19.5, tileMax: 17, title: `CanSat landing prediction — ${D.site.name}, ${U.fmtPHT(c.flightTime, true)}`,
        legend: [{ type: 'line', color: '#ff5252', dash: [8, 5], label: `Exclusion zone (+${c.exclusion} m)` }, { type: 'line', color: '#e1bee7', label: '95 % landing ellipse' }, { type: 'dot', color: '#ce93d8', label: 'Monte-Carlo landing' },
          { type: 'line', color: '#ffffff', label: 'Descent track' }, { type: 'dot', color: '#66bb6a', label: 'Packet received' }, { type: 'dot', color: '#ef5350', label: 'Packet lost' },
          { type: 'star', color: '#1565c0', label: 'Launch' }, { type: 'dot', color: '#2e7d32', label: 'Ground station' }, { type: 'dot', color: '#ffb300', label: 'Hot-spring vent' }, { type: 'box', color: '#ffd54f', alpha: 0.5, label: 'Vent H₂S ≥ 7 µg/m³ (1.5 m)' }],
        attr: 'Imagery: Esri World Imagery',
        draw: (g, P) => {
          const poly = (ll, stroke, fill, dash, lw = 2.5) => { g.beginPath(); ll.forEach(([la, lo], i) => { const [x, y] = P(la, lo); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } g.setLineDash(dash || []); g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); g.setLineDash([]); };
          const fp = S.lg && S.lg['cs-local'] && S.lg['cs-local'].getLayers()[0];
          if (fp && fp.getLatLngs) poly(fp.getLatLngs()[0].map((p) => [p.lat, p.lng]), '#b8860b', 'rgba(255,213,79,.45)', null, 1.5);
          poly(mc.exclusionLL, '#ff5252', 'rgba(255,82,82,.08)', [10, 6]);
          mc.pathsLL.slice(0, 40).forEach((pl) => { g.beginPath(); pl.forEach(([la, lo], i) => { const [x, y] = P(la, lo); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = 'rgba(206,147,216,.45)'; g.lineWidth = 1.2; g.stroke(); });
          mc.pointsLL.forEach(([la, lo]) => { const [x, y] = P(la, lo); g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fillStyle = 'rgba(206,147,216,.85)'; g.fill(); });
          poly(mc.ellipseLL, '#e1bee7', null, null, 3);
          g.beginPath(); r.track.filter((p) => p.t >= r.tRel).forEach((p, i) => { const [x, y] = P(p.ll[0], p.ll[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
          r.recs.filter((p) => p.phase === 'DESCENT' || p.phase === 'RELEASE').forEach((p) => { const [x, y] = P(p.tlat, p.tlon); g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fillStyle = p.rx ? '#66bb6a' : '#ef5350'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); });
          const [sx, sy] = P(c.site.lat, c.site.lon); star(g, sx, sy, W / 70, '#1565c0');
          const [mx, my] = P(mc.meanLL[0], mc.meanLL[1]);
          g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx, sy); g.lineTo(mx, my); g.stroke();
          const ang = Math.atan2(my - sy, mx - sx); g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - 14 * Math.cos(ang - 0.4), my - 14 * Math.sin(ang - 0.4)); g.lineTo(mx - 14 * Math.cos(ang + 0.4), my - 14 * Math.sin(ang + 0.4)); g.closePath(); g.fillStyle = '#fff'; g.fill();
          halo(g, `mean drift ${U.compass(mc.meanBrg)} ${mc.meanDist.toFixed(0)} m`, mx + 10, my + 18, Math.round(W / 85), '#111', '700');
          [[c.gs, '#2e7d32', 'Ground station'], [c.vent, '#ffb300', 'Vent']].forEach(([p, col, t]) => { const [x, y] = P(p.lat, p.lon); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); halo(g, t, x + 10, y - 8, Math.round(W / 95), '#111', '700'); });
          const [lx, ly] = P(r.landing.lat, r.landing.lon); g.strokeStyle = '#ffeb3b'; g.lineWidth = 3; g.beginPath(); g.moveTo(lx - 9, ly - 9); g.lineTo(lx + 9, ly + 9); g.moveTo(lx + 9, ly - 9); g.lineTo(lx - 9, ly + 9); g.stroke();
        } });
      return map.canvas;
    }, caption: () => { const mc = S.mc, r = S.cs; return `Predicted landing area of the CanSat at ${D.site.name} for a ${S.cfg.releaseAGL}-m release on ${U.fmtPHT(S.cfg.flightTime, true)}, on Esri World Imagery. Purple: ${mc.points.length} Monte-Carlo landings and descent paths with the 95 % ellipse (${mc.a.toFixed(0)} × ${mc.b.toFixed(0)} m); white arrow: mean drift ${U.compass(mc.meanBrg)} ${mc.meanDist.toFixed(0)} m; red dashed: exclusion zone (launch point and landing area buffered by ${S.cfg.exclusion} m, proposal D.8). The simulated flight (white track, packets green = received / red = lost) landed ${r.landing.dist.toFixed(0)} m ${U.compass(r.landing.brg)} (yellow ×). Yellow area: local vent H₂S above the WHO odour threshold at 1.5 m.`; } },

    { id: 'altTime', title: 'Altitude vs time', need: () => !!S.cs, render(W) {
      const r = S.cs, recs = r.recs;
      const phases = []; let cur = null, a = 0;
      recs.forEach((p) => { if (p.phase !== cur) { if (cur) phases.push([cur, a, p.met]); cur = p.phase; a = p.met; } }); phases.push([cur, a, recs[recs.length - 1].met]);
      const pc = { PRE: 'rgba(158,158,158,.12)', ASCENT: 'rgba(142,68,173,.10)', HOVER: 'rgba(31,119,180,.10)', RELEASE: 'rgba(255,152,0,.2)', DESCENT: 'rgba(211,47,47,.08)', LANDED: 'rgba(46,125,50,.10)' };
      const bands = { id: 'bands', beforeDatasetsDraw(ch) { const { ctx, chartArea: ca, scales } = ch; phases.forEach(([ph, x0, x1]) => { const X0 = scales.x.getPixelForValue(x0), X1 = scales.x.getPixelForValue(x1); ctx.fillStyle = pc[ph]; ctx.fillRect(X0, ca.top, X1 - X0, ca.bottom - ca.top); ctx.fillStyle = '#555'; ctx.font = `600 ${Math.round(W / 90)}px ${FONT}`; ctx.textAlign = 'center'; if (X1 - X0 > 40) ctx.fillText(ph, (X0 + X1) / 2, ca.top + 18); }); } };
      return chartCanvas({ type: 'line', plugins: [bands], data: { datasets: [
        { label: 'True altitude', data: recs.map((p) => ({ x: p.met, y: p.altTrue })), borderColor: '#9e9e9e', borderWidth: 5, pointRadius: 0 },
        { label: 'Barometric (BME280, firmware formula)', data: recs.map((p) => ({ x: p.met, y: p.altBaro })), borderColor: '#1f77b4', borderWidth: 2, pointRadius: 2.5 },
        { label: 'GPS (NEO-6M)', data: recs.map((p) => ({ x: p.met, y: p.altGps })), borderColor: '#ff7f0e', borderWidth: 1.8, borderDash: [6, 4], pointRadius: 0 }] },
        options: { plugins: { title: { display: true, text: 'Altitude above launch vs mission-elapsed time' }, legend: { position: 'bottom' } }, scales: { x: { type: 'linear', title: { display: true, text: 'Mission-elapsed time (s)' } }, y: { title: { display: true, text: 'Altitude AGL (m)' } } } } }, W, Math.round(W * 0.5));
    }, caption: () => { const st = S.cs.stats; return `Altitude of the CanSat through the simulated mission (pre-launch, drone ascent, hover, release, parachute descent, landing). True altitude (grey) compared with the firmware barometric altitude (RMSE ${st.altRmseBaro.toFixed(2)} m) and GPS altitude (RMSE ${st.altRmseGps.toFixed(2)} m). Measured descent rate ${st.descentRate.toFixed(2)} m/s.`; } },

    { id: 'profiles', title: 'Vertical profiles (8 parameters)', need: () => !!S.cs, render(W) {
      const r = S.cs, desc = r.recs.filter((p) => p.phase === 'DESCENT' || p.phase === 'RELEASE');
      const defs = [['so2ppb', 'so2ppb', 'SO₂ (ppb)', 1], ['h2s', 'h2sppb', 'H₂S (ppm)', 1 / 1000], ['co2', 'co2', 'CO₂ (ppm)', 1], ['pm25', 'pm25', 'PM2.5 (µg/m³)', 1],
        ['pm10', 'pm10', 'PM10 (µg/m³)', 1], ['T', 'T', 'Temperature (°C)', 1], ['RH', 'RH', 'Relative humidity (%)', 1], ['P', 'P', 'Pressure (hPa)', 1]];
      const cw = Math.round(W / 4), chh = Math.round(cw * 0.95);
      const [c, g] = canvas(W, chh * 2);
      defs.forEach(([k, tk, lab, conv], i) => {
        const rg = r.regress[k];
        const ch = chartCanvas({ type: 'scatter', data: { datasets: [
          { label: 'True', data: desc.map((p) => ({ x: p.truth[tk] * conv, y: p.altTrue })), showLine: true, borderColor: '#9e9e9e', borderWidth: 4, pointRadius: 0 },
          { label: 'Sensor', data: desc.map((p) => ({ x: p[k], y: p.altBaro })), showLine: true, borderColor: '#d62728', backgroundColor: '#d62728', borderWidth: 1.2, pointRadius: 3 }] },
          options: { plugins: { title: { display: true, text: `(${'abcdefgh'[i]}) ${lab}` }, subtitle: { display: isFinite(rg.slope100), text: `slope ${U.fmtSig(rg.slope100)}/100 m · R² ${isFinite(rg.r2) ? rg.r2.toFixed(2) : '—'}` }, legend: { display: i === 0, position: 'bottom' } },
            scales: { x: { title: { display: true, text: lab } }, y: { min: 0, title: { display: true, text: 'Altitude AGL (m)' } } } } }, cw, chh);
        g.drawImage(ch, (i % 4) * cw, Math.floor(i / 4) * chh);
      });
      return c;
    }, caption: () => `Vertical profiles recorded during the simulated ${S.cs.descentTime.toFixed(0)}-s parachute descent (red: sensor readings at 1 Hz against barometric altitude; grey: true atmospheric profile). Lags and biases follow the datasheets: the MH-Z19B CO₂ sensor (t90 ≈ 120 s) barely responds, the MQ-136 reads below its 1 ppm limit of detection for ambient H₂S, and the PMS5003 over-reads PM in humid air. Subtitles give the per-flight linear regression gradient per 100 m (proposal §C).` },

    { id: 'regTable', title: 'Per-flight regression table', need: () => !!S.cs, render(W) {
      const r = S.cs, rows = Object.values(r.regress);
      const fs = Math.round(W / 60), lh = fs * 2.1, cols = [0.04, 0.36, 0.58, 0.76, 0.9];
      const [c, g] = canvas(W, Math.round(lh * (rows.length + 3.5)));
      g.fillStyle = '#111'; g.font = `700 ${fs * 1.15}px ${FONT}`; g.textAlign = 'left';
      g.fillText(`Per-flight descriptive regression, value = a + b · altitude (descent, n = ${rows[0].n})`, W * 0.04, lh);
      const y0 = lh * 2;
      g.lineWidth = 2; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(W * 0.03, y0 - fs * 1.4); g.lineTo(W * 0.97, y0 - fs * 1.4); g.stroke();
      g.font = `700 ${fs}px ${FONT}`;
      ['Parameter', 'Gradient b (per 100 m)', 'Intercept a (at 0 m)', 'R²', 'n'].forEach((h, i) => g.fillText(h, W * cols[i], y0));
      g.beginPath(); g.lineWidth = 1; g.moveTo(W * 0.03, y0 + fs * 0.7); g.lineTo(W * 0.97, y0 + fs * 0.7); g.stroke();
      g.font = `${fs}px ${FONT}`;
      rows.forEach((row, k) => {
        const y = y0 + lh * (k + 1);
        [row.label, isFinite(row.slope100) ? U.fmtSig(row.slope100, 3) : '—', isFinite(row.intercept) ? U.fmtSig(row.intercept, 4) : '—', isFinite(row.r2) ? row.r2.toFixed(3) : '—', String(row.n)].forEach((t, i) => g.fillText(t, W * cols[i], y));
      });
      const yb = y0 + lh * (rows.length + 0.6);
      g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.03, yb); g.lineTo(W * 0.97, yb); g.stroke();
      return c;
    }, caption: () => `Descriptive per-flight simple linear regression of each measured parameter on barometric altitude for the simulated flight on ${U.fmtPHT(S.cfg.flightTime, true)} (proposal §C: altitude as the sole explanatory index; no inference beyond the flight). A low R² with a large gradient indicates noise-dominated or lagged readings rather than a true vertical gradient.` },

    { id: 'lora', title: 'LoRa link model', need: () => !!S.cs, render(W) {
      const L = S.cfg.lora, r = S.cs;
      const P = (d, los) => 1 / (1 + Math.exp(-(L.b0 + L.b1 * d + L.b2 * los)));
      const d90 = (L.b0 + L.b2 - Math.log(9)) / -L.b1, dmax = Math.max(2000, d90 * 1.4);
      const xs = Array.from({ length: 101 }, (_, i) => i / 100 * dmax);
      return chartCanvas({ type: 'scatter', data: { datasets: [
        { label: 'P(receive), line of sight', data: xs.map((d) => ({ x: d, y: P(d, 1) })), showLine: true, borderColor: '#2e7d32', borderWidth: 2.6, pointRadius: 0 },
        { label: 'P(receive), obstructed', data: xs.map((d) => ({ x: d, y: P(d, 0) })), showLine: true, borderColor: '#ef6c00', borderWidth: 2.6, borderDash: [7, 5], pointRadius: 0 },
        { label: `90 % range (${d90.toFixed(0)} m)`, data: [{ x: d90, y: 0 }, { x: d90, y: 1 }], showLine: true, borderColor: '#555', borderDash: [3, 4], borderWidth: 1.5, pointRadius: 0 },
        { label: 'Flight packets (1 = received, 0 = lost)', data: r.recs.map((p) => ({ x: p.dist, y: p.rx ? 1.02 : -0.02 })), backgroundColor: r.recs.map((p) => (p.rx ? 'rgba(46,125,50,.6)' : 'rgba(211,47,47,.9)')), pointRadius: 4 }] },
        options: { plugins: { title: { display: true, text: `LoRa packet reception model: logit P = ${L.b0} ${L.b1 < 0 ? '−' : '+'} ${Math.abs(L.b1)}·d + ${L.b2}·LOS` }, legend: { position: 'bottom' } },
          scales: { x: { min: 0, max: dmax, title: { display: true, text: 'Slant distance CanSat → ground station (m)' } }, y: { min: -0.08, max: 1.08, title: { display: true, text: 'Probability of reception' } } } } }, W, Math.round(W * 0.5));
    }, caption: () => { const st = S.cs.stats; return `Binomial logistic model of LoRa packet reception versus distance and line of sight (proposal §E), with the simulated flight's packets. The effective range (P = 0.90, line of sight) sets the maximum ground-station offset. Packet delivery ratio for this flight: ${(st.pdr * 100).toFixed(1)} % (${st.received}/${st.packets}); gaps longer than 3 s: ${st.gaps3s}.`; } },

    { id: 'windProfile', title: 'Wind & temperature profile at release', need: () => !!S.cs, render(W) {
      const env = S.cs.env, zs = Array.from({ length: 31 }, (_, i) => i * 5 + 0.5);
      const ws = zs.map((z) => { const [u, v] = CS.windUV(env, z); return U.uvToWsWd(u, v); });
      const a = chartCanvas({ type: 'scatter', data: { datasets: [
        { label: 'Wind speed', data: zs.map((z, i) => ({ x: ws[i][0], y: z })), showLine: true, borderColor: '#1f77b4', borderWidth: 2.6, pointRadius: 0 },
        { label: 'Forecast levels (10/80/120 m)', data: env.wind.map((w) => ({ x: w.ws, y: w.z })), backgroundColor: '#d62728', pointRadius: 7 },
        { label: 'Go/no-go limit 10 m/s', data: [{ x: 10, y: 0 }, { x: 10, y: 150 }], showLine: true, borderColor: '#c62828', borderDash: [6, 4], pointRadius: 0 }] },
        options: { plugins: { title: { display: true, text: '(a) Wind speed' }, legend: { position: 'bottom' } }, scales: { x: { min: 0, max: Math.max(11, Math.ceil(Math.max(...ws.map((w) => w[0])) + 1)), title: { display: true, text: 'm/s' } }, y: { min: 0, max: 150, title: { display: true, text: 'Height AGL (m)' } } } } }, Math.round(W / 3), Math.round(W * 0.42));
      const b = chartCanvas({ type: 'scatter', data: { datasets: [{ label: 'Wind direction (from)', data: zs.map((z, i) => ({ x: ws[i][1], y: z })), showLine: true, borderColor: '#9467bd', borderWidth: 2.6, pointRadius: 0 }] },
        options: { plugins: { title: { display: true, text: '(b) Wind direction' }, legend: { position: 'bottom' } }, scales: { x: { min: 0, max: 360, ticks: { stepSize: 90, callback: (v) => `${v}° ${U.compass(v)}` }, title: { display: true, text: 'degrees (from)' } }, y: { min: 0, max: 150, title: { display: true, text: 'Height AGL (m)' } } } } }, Math.round(W / 3), Math.round(W * 0.42));
      const c = chartCanvas({ type: 'scatter', data: { datasets: [{ label: 'Temperature', data: zs.map((z) => ({ x: CS.tempAt(env, z), y: z })), showLine: true, borderColor: '#d62728', borderWidth: 2.6, pointRadius: 0 }] },
        options: { plugins: { title: { display: true, text: '(c) Air temperature' }, legend: { position: 'bottom' } }, scales: { x: { title: { display: true, text: '°C' } }, y: { min: 0, max: 150, title: { display: true, text: 'Height AGL (m)' } } } } }, W - 2 * Math.round(W / 3), Math.round(W * 0.42));
      const [cv, g] = canvas(W, Math.round(W * 0.42)); g.drawImage(a, 0, 0); g.drawImage(b, Math.round(W / 3), 0); g.drawImage(c, 2 * Math.round(W / 3), 0); return cv;
    }, caption: () => { const env = S.cs.env; return `Near-surface atmosphere at the CanSat site at release (${U.fmtPHT(S.cfg.flightTime, true)}): (a) wind speed from the ${env.source === 'open-meteo' ? 'Open-Meteo' : 'climatological'} 10/80/120 m forecast with a logarithmic profile below 10 m, (b) wind direction and (c) temperature (Pasquill class ${env.cls}, ${env.lst >= 7 && env.lst <= 17 ? 'daytime superadiabatic surface layer' : 'nocturnal inversion'}). These drive the drift and the sensed temperature profile.`; } },

    { id: 'calendar', title: 'Flight-window calendar (go / no-go)', need: () => !!S.point, render(W) {
      const cal = A.flightCalendar ? A.flightCalendar() : null; if (!cal) return canvas(10, 10)[0];
      const fs = Math.round(W / 85), left = fs * 9, top = fs * 4.5, cw = (W - left - fs * 2) / 24, rh = fs * 2.2;
      const [c, g] = canvas(W, Math.round(top + cal.days.length * rh + fs * 6));
      g.fillStyle = '#111'; g.font = `700 ${fs * 1.2}px ${FONT}`; g.textAlign = 'left'; g.fillText(`Flight-window calendar — ${D.site.name} (PHT)`, left, fs * 1.8);
      g.font = `${fs}px ${FONT}`; g.textAlign = 'center';
      for (let h = 0; h < 24; h++) g.fillText(String(h).padStart(2, '0'), left + (h + 0.5) * cw, top - fs * 0.6);
      const colr = { GO: '#43a047', CAUTION: '#ffb300', 'NO-GO': '#e53935' };
      cal.days.forEach((d, i) => {
        const y = top + i * rh;
        g.textAlign = 'right'; g.fillStyle = '#111'; g.fillText(A.dayLabel(d.key), left - fs * 0.6, y + rh * 0.65);
        d.hours.forEach((cell, h) => {
          if (!cell) { g.fillStyle = '#eee'; g.fillRect(left + h * cw + 1, y + 1, cw - 2, rh - 2); return; }
          g.fillStyle = colr[cell.v]; g.globalAlpha = cell.day ? 1 : 0.35; g.fillRect(left + h * cw + 1, y + 1, cw - 2, rh - 2); g.globalAlpha = 1;
          if (Math.abs(cell.t - S.cfg.flightTime) < 1800e3) { g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(left + h * cw + 1.5, y + 1.5, cw - 3, rh - 3); }
        });
      });
      const ly = top + cal.days.length * rh + fs * 2.2; let x = left;
      [['GO', '#43a047'], ['CAUTION', '#ffb300'], ['NO-GO', '#e53935'], ['night (faded) — no VLOS flights', '#9e9e9e'], ['selected flight', null]].forEach(([t, cc]) => {
        if (cc) { g.fillStyle = cc; g.fillRect(x, ly - fs, fs * 2, fs * 1.2); } else { g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(x, ly - fs, fs * 2, fs * 1.2); }
        g.fillStyle = '#111'; g.textAlign = 'left'; g.fillText(t, x + fs * 2.6, ly); x += fs * 3.6 + g.measureText(t).width + fs;
      });
      return c;
    }, caption: () => { const cal = A.flightCalendar(); const go = cal.days.reduce((a, d) => a + d.hours.filter((h) => h && h.v === 'GO' && h.day).length, 0); return `Hourly go/no-go assessment for CanSat flights at ${D.site.name} over the forecast period, using the proposal's criteria (sustained wind at release altitude ≤ 10 m/s, no precipitation, no thunderstorm, visibility ≥ 2 km). ${go} daylight hours are GO. Black outline: the simulated flight.`; } },

    { id: 'campaign', title: 'Six-flight campaign summary', need: () => !!(S.campaign && S.campaign.length), render(W) {
      const C = S.campaign, col = (v) => (v === 'GO' ? '#43a047' : v === 'CAUTION' ? '#ffb300' : '#e53935');
      return chartCanvas({ data: { labels: C.map((r) => `F${r.flight} ${r.time.slice(11, 16)}`), datasets: [
        { type: 'bar', label: 'Landing distance (m)', data: C.map((r) => r.land), backgroundColor: C.map((r) => col(r.verdict)), yAxisID: 'y' },
        { type: 'line', label: 'Descent rate (m/s)', data: C.map((r) => r.rate), borderColor: '#1f77b4', backgroundColor: '#1f77b4', borderWidth: 2.5, pointRadius: 6, yAxisID: 'y2' },
        { type: 'line', label: 'Packet delivery (%)', data: C.map((r) => r.pdr), borderColor: '#9467bd', borderDash: [6, 4], borderWidth: 2, pointRadius: 5, yAxisID: 'y3' }] },
        options: { plugins: { title: { display: true, text: `Six-flight campaign, ${C[0].time.slice(0, 10)} (bar colour = go/no-go)` }, legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, title: { display: true, text: 'Landing distance (m)' } }, y2: { position: 'right', min: 0, max: 6, title: { display: true, text: 'Descent rate (m/s)' }, grid: { drawOnChartArea: false } }, y3: { display: false, min: 80, max: 101 } } } }, W, Math.round(W * 0.5));
    }, caption: () => { const C = S.campaign; return `Summary of the six simulated campaign flights (proposal D.9) at 07, 09, 11, 13, 15 and 17 PHT: landing distance from the launch point (bars, coloured by go/no-go), descent rate and LoRa packet delivery. ${C.filter((r) => r.verdict !== 'NO-GO').length} of 6 flights meet the weather criteria.`; } },

    { id: 'metContext', title: 'Meteorology at the priority vents', need: () => MET.ready, render(W) {
      const R = R_(); const [a, b] = MET.timeRange();
      const t0 = R ? R.params.startMs : Math.max(a, Date.now() - 3600e3), t1 = R ? t0 + R.params.hours * 3600e3 : Math.min(b, t0 + 48 * 3600e3);
      const ts = []; for (let t = t0; t <= t1; t += 3600e3) ts.push(t);
      const vs = ['leonard', 'apo'].map((id) => D.volcanoById(id));
      const ser = vs.map((v) => ts.map((t) => { const s = {}; MET.sample(v.lat, v.lon, v.elev + v.rise * 0.5, t, s); return s.valid ? { ws: Math.hypot(s.u, s.v), pbl: s.pblh, top: s.terrain + s.pblh } : null; }));
      const lbl = ts.map((t) => U.fmtPHT(t, true).slice(5, 16));
      return chartCanvas({ data: { labels: lbl, datasets: [
        { type: 'line', label: 'Mixed-layer top (m MSL) — Leonard', data: ser[0].map((s) => s && s.top), borderColor: '#1565c0', borderWidth: 2.4, pointRadius: 0, yAxisID: 'y' },
        { type: 'line', label: 'Mixed-layer top (m MSL) — Apo', data: ser[1].map((s) => s && s.top), borderColor: '#c62828', borderWidth: 2.4, pointRadius: 0, yAxisID: 'y' },
        { type: 'line', label: 'Vent — Leonard (1,190 m)', data: lbl.map(() => 1190), borderColor: '#1565c0', borderDash: [6, 5], borderWidth: 1.4, pointRadius: 0, yAxisID: 'y' },
        { type: 'line', label: 'Vent — Apo (2,954 m)', data: lbl.map(() => 2954), borderColor: '#c62828', borderDash: [6, 5], borderWidth: 1.4, pointRadius: 0, yAxisID: 'y' },
        { type: 'bar', label: 'Wind at plume height — Leonard (m/s)', data: ser[0].map((s) => s && s.ws), backgroundColor: 'rgba(21,101,192,.3)', yAxisID: 'y2' },
        { type: 'bar', label: 'Wind at plume height — Apo (m/s)', data: ser[1].map((s) => s && s.ws), backgroundColor: 'rgba(198,40,40,.3)', yAxisID: 'y2' }] },
        options: { plugins: { title: { display: true, text: 'Mixed-layer top vs vent height, and wind at plume height (GFS)' }, legend: { position: 'bottom' } },
          scales: { x: { ticks: { maxTicksLimit: 16, maxRotation: 45 } }, y: { title: { display: true, text: 'Height (m MSL)' }, beginAtZero: true }, y2: { position: 'right', beginAtZero: true, title: { display: true, text: 'Wind speed (m/s)' }, grid: { drawOnChartArea: false } } } } }, W, Math.round(W * 0.5));
    }, caption: () => `Meteorological control on ground impact at the priority vents from ${metText()}: when the mixed-layer top (solid) rises above the vent elevation (dashed), gas mixes down to the surface; when it falls below, as happens at night, the plume stays aloft. Bars: wind speed at plume height, which sets transport distance and dilution.` }
  ];
  F.DEFS = DEFS;

  /* ============================== rendering & window ============================== */
  async function renderFig(def, num, W, embed) {
    let cv = await def.render(W);
    const caption = def.caption();
    if (embed) {
      const fs = Math.round(W / 70), lh = fs * 1.4, [tmp, tg] = canvas(W, 10);
      tg.font = `${fs}px ${FONT}`;
      let lines = 1, line = '';
      (`Figure ${num}. ` + caption).split(' ').forEach((w) => { const t = line ? line + ' ' + w : w; if (tg.measureText(t).width > W - fs * 3) { lines++; line = w; } else line = t; });
      const [c2, g2] = canvas(cv.width, cv.height + Math.round(lines * lh + fs * 2));
      g2.drawImage(cv, 0, 0);
      g2.fillStyle = '#111'; g2.font = `${fs}px ${FONT}`; g2.textAlign = 'left';
      g2.font = `700 ${fs}px ${FONT}`; const lab = `Figure ${num}.`; g2.fillText(lab, fs * 1.5, cv.height + fs * 1.6);
      const lw = g2.measureText(lab + ' ').width; g2.font = `${fs}px ${FONT}`;
      // first line continues after the bold label
      const words = caption.split(' '); let x = fs * 1.5 + lw, y = cv.height + fs * 1.6, cur = '';
      const maxW = W - fs * 3;
      words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (x - fs * 1.5 + g2.measureText(t).width > maxW) { g2.fillText(cur, x, y); y += lh; x = fs * 1.5; cur = w; } else cur = t; });
      if (cur) g2.fillText(cur, x, y);
      cv = c2; void tmp;
    }
    return { url: cv.toDataURL('image/png'), caption, title: def.title, num };
  }

  F.open = function () {
    const ex = UI.getWindow('figures');
    if (ex) { ex.refresh(); ex.focus(); return; }
    UI.window({ id: 'figures', title: 'Print Layout — Figures & Report', icon: 'save', width: Math.min(1180, window.innerWidth - 30), height: Math.min(820, window.innerHeight - 30),
      content: (body, api) => {
        const bar = el('div', { class: 'at-top fig-bar' });
        const sizeSel = el('select', {}, [el('option', { value: 1600, text: 'Standard (1600 px)' }), el('option', { value: 2400, text: 'High-res (2400 px)' }), el('option', { value: 1100, text: 'Slides (1100 px)' })]);
        const emb = el('input', { type: 'checkbox' }); emb.checked = true;
        const prog = el('span', { class: 'muted' });
        bar.append(
          el('button', { class: 'btn primary', text: 'Generate all figures', onclick: () => genAll() }),
          el('button', { class: 'btn', text: 'Download all (ZIP)', onclick: () => zipAll() }),
          el('button', { class: 'btn', text: 'Print / Save as PDF', onclick: () => printAll() }),
          el('span', { text: 'Size' }), sizeSel,
          el('label', { class: 'chk' }, [emb, el('span', { text: 'Embed number & caption in PNG' })]),
          el('button', { class: 'btn', text: 'Open 3D view', onclick: () => AERIS.scene3d.open() }),
          prog);
        const grid = el('div', { class: 'fig-grid' });
        body.append(bar, el('div', { class: 'fig-scroll' }, [grid]));
        const avail = () => DEFS.filter((d) => { try { return d.need(); } catch (e) { return false; } });
        api.refresh = () => {
          grid.innerHTML = '';
          let n = 0;
          DEFS.forEach((d) => {
            let ok = false; try { ok = d.need(); } catch (e) { ok = false; }
            const num = ok ? ++n : null;
            const card = el('div', { class: 'fig-card' + (ok ? '' : ' na'), 'data-id': d.id });
            const r = rendered[d.id];
            card.appendChild(el('div', { class: 'fig-h', html: `<b>${num ? 'Figure ' + num : '—'}</b> · ${U.esc(d.title)}` }));
            const imgBox = el('div', { class: 'fig-img' });
            if (r && ok) imgBox.appendChild(el('img', { src: r.url, alt: d.title }));
            else imgBox.appendChild(el('div', { class: 'muted', text: ok ? 'Not rendered yet — click Render.' : (d.hint || 'Not available yet: run the corresponding model first.') }));
            card.appendChild(imgBox);
            if (ok) {
              const capTxt = (() => { try { return d.caption(); } catch (e) { return ''; } })();
              card.appendChild(el('div', { class: 'fig-cap', html: `<b>Figure ${num}.</b> ${U.esc(capTxt)}` }));
              card.appendChild(el('div', { class: 'fig-acts' }, [
                el('button', { class: 'btn small', text: r ? 'Re-render' : 'Render', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Rendering…'; await renderOne(d, num); api.refresh(); } }),
                el('button', { class: 'btn small', text: 'Download PNG', disabled: !r, onclick: () => r && U.downloadURL(fileName(num, d), r.url) }),
                el('button', { class: 'btn small', text: 'Copy caption', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(`Figure ${num}. ${capTxt}`); UI.status('Caption copied'); } })
              ]));
            }
            grid.appendChild(card);
          });
          prog.textContent = `${avail().length} figures available · ${Object.keys(rendered).length} rendered`;
        };
        const renderOne = async (d, num) => {
          try { rendered[d.id] = await renderFig(d, num, +sizeSel.value, emb.checked); }
          catch (e) { console.error(e); UI.message('Figure', `Figure “${d.title}” failed: ${U.esc(e.message)}`, 'err', 8000); }
        };
        const numbered = () => { let n = 0; return avail().map((d) => ({ d, num: ++n })); };
        const genAll = async () => {
          const list = numbered();
          for (let i = 0; i < list.length; i++) { prog.textContent = `Rendering ${i + 1} / ${list.length}: ${list[i].d.title}…`; await renderOne(list[i].d, list[i].num); }
          api.refresh();
          UI.message('Figures', `${list.length} figures rendered. Use “Download all (ZIP)” or “Print / Save as PDF”.`, 'ok', 7000);
        };
        const ensure = async () => { const list = numbered(); for (const { d, num } of list) if (!rendered[d.id] || rendered[d.id].num !== num) await renderOne(d, num); api.refresh(); return list; };
        const fileName = (num, d) => `Figure_${String(num).padStart(2, '0')}_${d.id}.png`;
        const zipAll = async () => {
          prog.textContent = 'Preparing ZIP…';
          const list = await ensure();
          const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('JSZip failed to load')); document.head.appendChild(s); });
          if (!window.JSZip) await load('vendor/jszip.min.js').catch(() => load('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'));
          const zip = new JSZip();
          let txt = `AERIS-GIS figures — generated ${new Date().toISOString()}\n${MET.describe()}\n\n`;
          list.forEach(({ d, num }) => { const r = rendered[d.id]; if (!r) return; zip.file(fileName(num, d), r.url.split(',')[1], { base64: true }); txt += `Figure ${num}. ${r.caption}\n\n`; });
          zip.file('captions.txt', txt);
          const blob = await zip.generateAsync({ type: 'blob' });
          U.downloadURL(`AERIS_figures_${new Date().toISOString().slice(0, 10)}.zip`, URL.createObjectURL(blob));
          prog.textContent = `ZIP saved (${list.length} figures + captions.txt)`;
        };
        const printAll = async () => {
          const list = await ensure();
          const w = window.open('', '_blank');
          if (!w) { UI.message('Print', 'Allow pop-ups for this page to print the figures.', 'warn', 8000); return; }
          w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>AERIS-GIS Figures</title><style>body{font:12pt Arial,sans-serif;margin:18mm;color:#111}h1{font-size:16pt}figure{margin:0 0 14mm;page-break-inside:avoid}img{width:100%;border:1px solid #ccc}figcaption{margin-top:3mm;font-size:10.5pt;line-height:1.4}</style></head><body>
            <h1>Project AERIS — model figures</h1><p>${U.esc(MET.describe())}<br>Generated ${new Date().toLocaleString()}</p>
            ${list.map(({ d, num }) => rendered[d.id] ? `<figure><img src="${rendered[d.id].url}"><figcaption>${emb.checked ? '' : `<b>Figure ${num}.</b> ${U.esc(rendered[d.id].caption)}`}</figcaption></figure>` : '').join('')}
            <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
          w.document.close();
        };
        api.refresh();
      } });
  };
})();

/* AERIS-GIS — shared utilities (geodesy, random numbers, formatting, CRC, export) */
(function () {
  'use strict';
  const U = {};
  const DEG = Math.PI / 180;
  U.DEG = DEG;
  U.R_EARTH = 6371008.8;
  U.M_PER_DEG = 111320;

  U.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  U.lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- seeded random numbers (reproducible model runs) ---------- */
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.gaussFactory = function (rand) {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u, v, s;
      do { u = rand() * 2 - 1; v = rand() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * m;
      return u * m;
    };
  };

  /* ---------- geodesy ---------- */
  U.haversine = function (lat1, lon1, lat2, lon2) {
    const p1 = lat1 * DEG, p2 = lat2 * DEG, dp = (lat2 - lat1) * DEG, dl = (lon2 - lon1) * DEG;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * U.R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  U.bearing = function (lat1, lon1, lat2, lon2) {
    const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / DEG + 360) % 360;
  };
  U.destination = function (lat, lon, brgDeg, dist) {
    const d = dist / U.R_EARTH, b = brgDeg * DEG, p1 = lat * DEG, l1 = lon * DEG;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 / DEG, ((l2 / DEG + 540) % 360) - 180];
  };
  /* local tangent-plane offset (metres east / north) -> lat/lon */
  U.offsetLL = function (lat, lon, east, north) {
    return [lat + north / U.M_PER_DEG, lon + east / (U.M_PER_DEG * Math.cos(lat * DEG))];
  };
  U.llToLocal = function (lat0, lon0, lat, lon) {
    return [(lon - lon0) * U.M_PER_DEG * Math.cos(lat0 * DEG), (lat - lat0) * U.M_PER_DEG];
  };
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  U.compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

  /* wind: meteorological direction (FROM) <-> u/v components */
  U.wsWdToUV = (ws, wd) => [-ws * Math.sin(wd * DEG), -ws * Math.cos(wd * DEG)];
  U.uvToWsWd = (u, v) => [Math.hypot(u, v), (Math.atan2(-u, -v) / DEG + 360) % 360];

  /* WGS84 -> UTM (Snyder 1987) */
  U.toUTM = function (lat, lon) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const zone = Math.floor((lon + 180) / 6) + 1;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
    const p = lat * DEG, l = lon * DEG;
    const sp = Math.sin(p), cp = Math.cos(p), tp = Math.tan(p);
    const N = a / Math.sqrt(1 - e2 * sp * sp);
    const T = tp * tp, C = ep2 * cp * cp, A = cp * (l - lon0);
    const e4 = e2 * e2, e6 = e4 * e2;
    const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p)
      - (35 * e6 / 3072) * Math.sin(6 * p));
    const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let No = k0 * (M + N * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (lat < 0) No += 10000000;
    return { zone, hemi: lat >= 0 ? 'N' : 'S', E, N: No, epsg: (lat >= 0 ? 32600 : 32700) + zone };
  };
  U.toWebMercator = function (lat, lon) {
    const R = 6378137;
    return [R * lon * DEG, R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2))];
  };

  /* ---------- formatting ---------- */
  U.fmtLat = (v, d = 4) => `${Math.abs(v).toFixed(d)}°${v >= 0 ? 'N' : 'S'}`;
  U.fmtLon = (v, d = 4) => `${Math.abs(v).toFixed(d)}°${v >= 0 ? 'E' : 'W'}`;
  U.fmtLL = (lat, lon, d = 4) => `${U.fmtLat(lat, d)} ${U.fmtLon(lon, d)}`;
  U.fmtNum = function (x, d = 0) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    return Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  U.fmtSig = function (x, sig = 3) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1000) return U.fmtNum(x, 0);
    if (a >= 0.01) return Number(x.toPrecision(sig)).toString();
    return x.toExponential(1);
  };
  const pad = (n) => String(n).padStart(2, '0');
  U.fmtUTC = function (ms, withDate = true) {
    const d = new Date(ms);
    const t = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    return withDate ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${t} UTC` : `${t} UTC`;
  };
  U.fmtPHT = function (ms, withDate = false) {
    const d = new Date(ms + 8 * 3600e3);
    const t = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    return withDate ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${t} PHT` : `${t} PHT`;
  };
  /* value for <input type=datetime-local> interpreted as PHT (UTC+8) */
  U.toPHTInput = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 16);
  U.fromPHTInput = (s) => Date.parse(s + ':00Z') - 8 * 3600e3;
  U.toUTCInput = (ms) => new Date(ms).toISOString().slice(0, 16);
  U.fromUTCInput = (s) => Date.parse(s + ':00Z');
  U.hysplitDate = function (ms) {
    const d = new Date(ms);
    return `${pad(d.getUTCFullYear() % 100)} ${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}`;
  };

  /* ---------- CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — telemetry integrity hash ---------- */
  U.crc16 = function (str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= (str.charCodeAt(i) & 0xff) << 8;
      for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
  };

  /* ---------- statistics ---------- */
  U.linreg = function (xs, ys) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (!isFinite(x) || !isFinite(y)) continue;
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    }
    if (n < 3) return { n, slope: NaN, intercept: NaN, r2: NaN };
    const vx = sxx - sx * sx / n, vy = syy - sy * sy / n, cxy = sxy - sx * sy / n;
    const slope = vx > 0 ? cxy / vx : NaN;
    const intercept = (sy - slope * sx) / n;
    const r2 = vx > 0 && vy > 0 ? (cxy * cxy) / (vx * vy) : NaN;
    return { n, slope, intercept, r2 };
  };
  U.mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

  /* ---------- export helpers ---------- */
  U.toCSV = function (rows, cols) {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'number' ? (isFinite(v) ? String(v) : '') : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.map((c) => esc(c.label || c.key)).join(',')]
      .concat(rows.map((r) => cols.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(','))).join('\n');
  };
  U.download = function (filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.downloadURL = function (filename, url) {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => a.remove(), 500);
  };

  /* Yield to the browser without setTimeout (timers are throttled to ≥1 s in background tabs) */
  const chan = new MessageChannel(), waiting = [];
  chan.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
  U.sleep0 = () => new Promise((r) => { waiting.push(r); chan.port2.postMessage(0); });
  let lastYield = 0;
  U.maybeYield = async function (budgetMs = 40) {
    const now = performance.now();
    if (document.hidden || now - lastYield < budgetMs) return false; // hidden tab: nobody watches the progress bar
    await U.sleep0();
    lastYield = performance.now();
    return true;
  };
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- tiny DOM helper ---------- */
  U.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  /* ---------- IndexedDB cache (met data); every call degrades silently ---------- */
  U.idb = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res) => {
        try {
          const rq = indexedDB.open('aeris-gis', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return dbp;
    }
    async function get(key) {
      const db = await open();
      if (!db) return null;
      return new Promise((res) => {
        try {
          const rq = db.transaction('kv', 'readonly').objectStore('kv').get(key);
          rq.onsuccess = () => res(rq.result || null);
          rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
    }
    async function set(key, val) {
      const db = await open();
      if (!db) return false;
      return new Promise((res) => {
        try {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(val, key);
          tx.oncomplete = () => res(true);
          tx.onerror = () => res(false);
        } catch (e) { res(false); }
      });
    }
    async function clear() {
      const db = await open();
      if (!db) return;
      try { db.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (e) { /* ignore */ }
    }
    return { get, set, clear };
  })();

  U.lsGet = function (k, dflt) { try { const v = localStorage.getItem(k); return v === null ? dflt : JSON.parse(v); } catch (e) { return dflt; } };
  U.lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

  window.AERIS = window.AERIS || {};
  window.AERIS.U = U;
})();

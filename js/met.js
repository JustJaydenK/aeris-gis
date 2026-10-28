/* AERIS-GIS — meteorology: gridded NWP winds from Open-Meteo (no API key), sampling & fallback climatology.
   HYSPLIT normally reads ARL-format GDAS/GFS files. Here the same GFS 0.25° model output is pulled from
   Open-Meteo's free JSON API on two nested grids and interpolated in space, height and time. */
(function () {
  'use strict';
  const U = AERIS.U, D = AERIS.data, DEG = U.DEG;

  /* Vertical levels. Pressure-level heights are tropical standard-atmosphere values (m MSL). */
  const LEVELS = [
    { key: '10m', label: '10 m AGL', agl: 10 },
    { key: '1000hPa', label: '1000 hPa (≈110 m)', z: 110 },
    { key: '925hPa', label: '925 hPa (≈800 m)', z: 800 },
    { key: '850hPa', label: '850 hPa (≈1500 m)', z: 1500 },
    { key: '700hPa', label: '700 hPa (≈3150 m)', z: 3150 }
  ];
  const NL = LEVELS.length;
  const Z0 = 0.5; // roughness length (m) — forest / agricultural mosaic

  const GRID_DEFS = {
    nest: { id: 'nest', name: 'Mindanao nest 0.25°', lat0: 5.75, lon0: 124.25, dlat: 0.25, dlon: 0.25, nlat: 13, nlon: 13 },
    parent: { id: 'parent', name: 'Philippines 1.0°', lat0: 4.0, lon0: 117.0, dlat: 1.0, dlon: 1.0, nlat: 18, nlon: 11 }
  };

  const MODELS = {
    gfs_seamless: 'NOAA GFS 0.25° (same parent model as HYSPLIT READY)',
    ecmwf_ifs025: 'ECMWF IFS 0.25°',
    icon_seamless: 'DWD ICON',
    jma_seamless: 'JMA GSM',
    climatology: 'Offline monsoon climatology (no forecast)'
  };

  const HOURLY = [];
  LEVELS.forEach((l) => HOURLY.push('wind_speed_' + l.key, 'wind_direction_' + l.key));
  HOURLY.push('boundary_layer_height', 'precipitation', 'relative_humidity_2m', 'cloud_cover');

  const M = {
    LEVELS, NL, GRID_DEFS, MODELS,
    model: U.lsGet('aeris.metModel', 'gfs_seamless'),
    grids: [],      // [nest, parent]
    t0: 0, nt: 0,   // hourly time axis (ms)
    source: 'none', // 'open-meteo' | 'climatology'
    issued: 0,
    ready: false,
    period: U.lsGet('aeris.period', null)   // null = latest forecast, else { start, end } as PHT calendar dates 'YYYY-MM-DD'
  };

  /* ---------------- forecast / analysis period ----------------
     Latest mode: yesterday → +3 days. Custom mode: any PHT date range of ≤ 14 days, from 2022-01-01 to
     14 days ahead. Past ranges come from Open-Meteo's Historical Forecast API (archived GFS runs, which
     still carry boundary-layer height); current/future ranges from the Forecast API. */
  const DAY = 86400e3;
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const todayUTC = () => Math.floor(Date.now() / DAY) * DAY;
  M.MAX_DAYS = 14;
  M.limits = () => ({ min: '2022-01-01', max: ymd(todayUTC() + 14 * DAY) });
  M.setPeriod = function (p) { M.period = p; U.lsSet('aeris.period', p); };
  M.periodQuery = function () {
    if (!M.period) return { qs: '&past_days=1&forecast_days=3', host: 'api.open-meteo.com', hist: false };
    // PHT midnight is 16:00 UTC of the previous day, so the UTC request starts one day earlier
    const s = Date.parse(M.period.start + 'T00:00:00Z') - DAY;
    const e = Date.parse(M.period.end + 'T00:00:00Z');
    const hist = e < todayUTC() - DAY;
    return { qs: `&start_date=${ymd(s)}&end_date=${ymd(e)}`, host: hist ? 'historical-forecast-api.open-meteo.com' : 'api.open-meteo.com', hist, s, e: e + DAY - 3600e3 };
  };
  M.validatePeriod = function (start, end) {
    const L = M.limits();
    if (!start || !end) return 'Choose both a start and an end date.';
    if (end < start) return 'End date is before the start date.';
    if (start < L.min) return `Earliest supported date is ${L.min}.`;
    if (end > L.max) return `GFS forecasts reach only 14 days ahead (last date ${L.max}).`;
    const days = (Date.parse(end) - Date.parse(start)) / DAY + 1;
    if (days > M.MAX_DAYS) return `A period can be at most ${M.MAX_DAYS} days (you chose ${days}).`;
    return null;
  };
  M.periodLabel = function () {
    const f = (ms) => new Date(ms + 8 * 3600e3).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    if (M.period) {
      const s = Date.parse(M.period.start + 'T00:00:00Z') - 8 * 3600e3, e = Date.parse(M.period.end + 'T00:00:00Z') - 8 * 3600e3;
      return `${f(s)} – ${f(e)} ${M.period.end.slice(0, 4)}`;
    }
    if (!M.ready) return 'Latest forecast';
    const [a, b] = M.timeRange();
    const y = new Date(b + 8 * 3600e3).getUTCFullYear();
    return `${M.period ? '' : 'Latest · '}${f(a)} – ${f(b)} ${y}`;
  };

  /* ------------------------------------------------------------------ */
  function allocGrid(def, nt) {
    const npts = def.nlat * def.nlon;
    return Object.assign({}, def, {
      npts, nt,
      u: new Float32Array(nt * NL * npts), v: new Float32Array(nt * NL * npts),
      pblh: new Float32Array(nt * npts), precip: new Float32Array(nt * npts),
      rh: new Float32Array(nt * npts), cloud: new Float32Array(nt * npts),
      elev: new Float32Array(npts)
    });
  }

  function diurnalPBL(tMs, lon) {
    const lst = ((tMs / 3.6e6 + lon / 15) % 24 + 24) % 24;
    const s = lst >= 7 && lst <= 18 ? Math.sin(Math.PI * (lst - 7) / 11) : 0;
    return 350 + 1050 * s;
  }

  async function fetchJSON(url, tries = 3, onMsg) {
    let lastErr;
    for (let k = 0; k < tries; k++) {
      try {
        const r = await fetch(url);
        if (r.status === 429 && k < tries - 1) {           // minutely rate limit: wait it out
          const wait = 15 * (k + 1);
          onMsg && onMsg(`Open-Meteo rate limit reached — retrying in ${wait} s`);
          await new Promise((res) => setTimeout(res, wait * 1000));
          continue;
        }
        if (!r.ok) {
          let reason = r.status + ' ' + r.statusText;
          try { const j = await r.json(); if (j && j.reason) reason = j.reason; } catch (e) { /* ignore */ }
          throw new Error(reason);
        }
        return await r.json();
      } catch (e) {
        lastErr = e;
        await new Promise((res) => setTimeout(res, 600 * (k + 1)));
      }
    }
    throw lastErr;
  }

  async function fetchGrid(def, model, onMsg) {
    const pts = [];
    for (let j = 0; j < def.nlat; j++) for (let i = 0; i < def.nlon; i++) pts.push([def.lat0 + j * def.dlat, def.lon0 + i * def.dlon]);
    const CH = 40;
    const chunks = [];
    for (let c = 0; c < pts.length; c += CH) chunks.push(pts.slice(c, c + CH));
    const parts = new Array(chunks.length);
    let next = 0, done = 0;
    onMsg && onMsg(`${def.name}: requesting ${pts.length} grid points…`);
    const pq = M.periodQuery();
    const worker = async () => {
      while (next < chunks.length) {
        const i = next++, chunk = chunks[i];
        const url = `https://${pq.host}/v1/forecast?latitude=` + chunk.map((p) => p[0].toFixed(3)).join(',') +
          '&longitude=' + chunk.map((p) => p[1].toFixed(3)).join(',') +
          '&hourly=' + HOURLY.join(',') + '&models=' + model +
          '&wind_speed_unit=ms&timeformat=unixtime&cell_selection=nearest' + pq.qs;
        const r = await fetchJSON(url, 4, onMsg);
        parts[i] = Array.isArray(r) ? r : [r];
        done++;
        onMsg && onMsg(`${def.name}: ${done} / ${chunks.length} batches received`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const results = [].concat(...parts);
    const times = results[0].hourly.time;
    const nt = times.length;
    const g = allocGrid(def, nt);
    g.t0 = times[0] * 1000;
    const npts = g.npts;
    let missingPBL = 0;
    results.forEach((loc, p) => {
      const h = loc.hourly;
      g.elev[p] = isFinite(loc.elevation) ? Math.max(0, loc.elevation) : 0;
      for (let t = 0; t < nt; t++) {
        for (let l = 0; l < NL; l++) {
          const ws = h['wind_speed_' + LEVELS[l].key], wd = h['wind_direction_' + LEVELS[l].key];
          const s = ws ? ws[t] : null, d = wd ? wd[t] : null;
          const idx = (t * NL + l) * npts + p;
          if (s === null || d === null || s === undefined || d === undefined) { g.u[idx] = NaN; g.v[idx] = NaN; continue; }
          g.u[idx] = -s * Math.sin(d * DEG);
          g.v[idx] = -s * Math.cos(d * DEG);
        }
        const q = t * npts + p;
        const pb = h.boundary_layer_height ? h.boundary_layer_height[t] : null;
        if (pb === null || pb === undefined) { g.pblh[q] = NaN; missingPBL++; } else g.pblh[q] = Math.max(50, pb);
        const pr = h.precipitation ? h.precipitation[t] : null;
        g.precip[q] = pr === null || pr === undefined ? 0 : pr;
        const rh = h.relative_humidity_2m ? h.relative_humidity_2m[t] : null;
        g.rh[q] = rh === null || rh === undefined ? 80 : rh;
        const cc = h.cloud_cover ? h.cloud_cover[t] : null;
        g.cloud[q] = cc === null || cc === undefined ? 50 : cc;
      }
    });
    fillGaps(g);
    g.missingPBL = missingPBL;
    return g;
  }

  /* fill missing level winds from neighbouring levels; missing PBL from the diurnal parameterisation */
  function fillGaps(g) {
    const npts = g.npts;
    for (let t = 0; t < g.nt; t++) for (let p = 0; p < npts; p++) {
      for (let l = 0; l < NL; l++) {
        const idx = (t * NL + l) * npts + p;
        if (isFinite(g.u[idx])) continue;
        let found = false;
        for (let d = 1; d < NL && !found; d++) for (const ll of [l - d, l + d]) {
          if (ll < 0 || ll >= NL) continue;
          const j = (t * NL + ll) * npts + p;
          if (isFinite(g.u[j])) { g.u[idx] = g.u[j]; g.v[idx] = g.v[j]; found = true; break; }
        }
        if (!found) { g.u[idx] = 0; g.v[idx] = 0; }
      }
      const q = t * npts + p;
      if (!isFinite(g.pblh[q])) {
        const lon = g.lon0 + (p % g.nlon) * g.dlon;
        g.pblh[q] = diurnalPBL(g.t0 + t * 3600e3, lon);
      }
    }
  }

  /* ---------------- offline climatology (clearly labelled, never presented as a forecast) --------------- */
  function buildClimatology(def, t0, nt) {
    const g = allocGrid(def, nt);
    g.t0 = t0;
    const reg = D.climatology.regimes[D.climatology.byMonth[new Date(t0).getUTCMonth()]];
    const levMap = [0, 1, 1, 2, 3]; // LEVELS -> regime levels (10m, 925, 925, 850, 700)
    for (let j = 0; j < def.nlat; j++) for (let i = 0; i < def.nlon; i++) {
      const p = j * def.nlon + i, lat = def.lat0 + j * def.dlat, lon = def.lon0 + i * def.dlon;
      let e = 0;
      D.volcanoes.forEach((v) => {
        const d = U.haversine(lat, lon, v.lat, v.lon);
        e += v.elev * 0.8 * Math.exp(-((d / 15000) ** 2));
      });
      g.elev[p] = e;
      for (let t = 0; t < nt; t++) {
        const tm = t0 + t * 3600e3;
        const lst = ((tm / 3.6e6 + lon / 15) % 24 + 24) % 24;
        const day = lst >= 8 && lst <= 17 ? Math.sin(Math.PI * (lst - 8) / 9) : 0;
        for (let l = 0; l < NL; l++) {
          const [dir0, spd0] = reg.lv[levMap[l]];
          const pert = 18 * Math.sin(lat * 1.7 + lon * 0.9 + t / 7) + 10 * Math.cos(lat * 0.6 - lon * 1.3 + t / 11);
          let spd = spd0 * (1 + 0.2 * Math.sin(lat * 1.1 - lon * 0.7 + t / 9));
          if (l === 0) spd *= 0.65 + 0.6 * day;
          const [u, v] = U.wsWdToUV(spd, dir0 + pert);
          const idx = (t * NL + l) * g.npts + p;
          g.u[idx] = u; g.v[idx] = v;
        }
        const q = t * g.npts + p;
        g.pblh[q] = diurnalPBL(tm, lon);
        g.precip[q] = 0; g.rh[q] = 78 - 12 * day; g.cloud[q] = 45;
      }
    }
    return g;
  }

  /* ---------------- public: load meteorology ---------------- */
  M.load = async function (opts = {}) {
    const onMsg = opts.onMsg || (() => {});
    const model = opts.model || M.model;
    M.model = model;
    U.lsSet('aeris.metModel', model);
    M.ready = false;
    const pq = M.periodQuery();
    // archived (past) periods never change, so they cache without an expiry stamp
    const stamp = pq.hist ? 'archive' : Math.floor(Date.now() / (3 * 3600e3));
    const per = M.period ? `${M.period.start}_${M.period.end}` : 'latest';
    if (model !== 'climatology') {
      try {
        const grids = [];
        for (const key of ['nest', 'parent']) {
          const def = GRID_DEFS[key];
          const cacheKey = `grid|${key}|${def.lat0},${def.lon0},${def.nlat}x${def.nlon}|${model}|${per}|${stamp}`;
          let g = opts.noCache ? null : await U.idb.get(cacheKey);
          if (g && g.u && g.nt) onMsg(`${def.name}: loaded from cache`);
          else {
            g = await fetchGrid(def, model, onMsg);
            await U.idb.set(cacheKey, g);
          }
          grids.push(g);
        }
        M.grids = grids;
        M.t0 = Math.max(grids[0].t0, grids[1].t0);
        M.nt = Math.min(grids[0].nt - (M.t0 - grids[0].t0) / 3600e3, grids[1].nt - (M.t0 - grids[1].t0) / 3600e3);
        M.source = 'open-meteo';
        M.issued = Date.now();
        M.ready = true;
        return M;
      } catch (e) {
        onMsg('Open-Meteo unavailable (' + e.message + ') — falling back to climatology');
        M.fetchError = e.message;
      }
    }
    const t0 = pq.s !== undefined ? pq.s : Math.floor(Date.now() / 3600e3) * 3600e3 - 24 * 3600e3;
    const nt = pq.s !== undefined ? Math.round((pq.e - pq.s) / 3600e3) + 1 : 96;
    M.grids = [buildClimatology(GRID_DEFS.nest, t0, nt), buildClimatology(GRID_DEFS.parent, t0, nt)];
    M.t0 = t0; M.nt = nt; M.source = 'climatology'; M.issued = Date.now(); M.ready = true;
    if (model !== 'climatology') M.model = model; // keep user preference for next retry
    return M;
  };

  M.timeRange = () => [M.t0, M.t0 + (M.nt - 1) * 3600e3];
  M.describe = function () {
    if (!M.ready) return 'Meteorology not loaded';
    const [a, b] = M.timeRange();
    const src = M.source === 'open-meteo' ? (MODELS[M.model] || M.model) + (M.periodQuery().hist ? ' archived runs' : '') + ' via Open-Meteo' : MODELS.climatology;
    return `${src} · ${U.fmtUTC(a)} → ${U.fmtUTC(b)}`;
  };

  /* ---------------- sampling (hot path — no allocations) ---------------- */
  function inside(g, lat, lon) {
    return lat >= g.lat0 && lat <= g.lat0 + (g.nlat - 1) * g.dlat && lon >= g.lon0 && lon <= g.lon0 + (g.nlon - 1) * g.dlon;
  }
  M.gridFor = function (lat, lon) {
    const G = M.grids;
    if (G[0] && inside(G[0], lat, lon)) return G[0];
    if (G[1] && inside(G[1], lat, lon)) return G[1];
    return null;
  };

  const W = { p00: 0, p01: 0, p10: 0, p11: 0, w00: 0, w01: 0, w10: 0, w11: 0 };
  function weights(g, lat, lon) {
    let fx = (lon - g.lon0) / g.dlon, fy = (lat - g.lat0) / g.dlat;
    let i0 = Math.floor(fx), j0 = Math.floor(fy);
    if (i0 >= g.nlon - 1) i0 = g.nlon - 2; if (i0 < 0) i0 = 0;
    if (j0 >= g.nlat - 1) j0 = g.nlat - 2; if (j0 < 0) j0 = 0;
    const ax = U.clamp(fx - i0, 0, 1), ay = U.clamp(fy - j0, 0, 1);
    W.p00 = j0 * g.nlon + i0; W.p01 = W.p00 + 1; W.p10 = W.p00 + g.nlon; W.p11 = W.p10 + 1;
    W.w00 = (1 - ax) * (1 - ay); W.w01 = ax * (1 - ay); W.w10 = (1 - ax) * ay; W.w11 = ax * ay;
  }
  function bil(a, off) {
    return a[off + W.p00] * W.w00 + a[off + W.p01] * W.w01 + a[off + W.p10] * W.w10 + a[off + W.p11] * W.w11;
  }

  M.terrainAt = function (lat, lon) {
    const g = M.gridFor(lat, lon);
    if (!g) return NaN;
    weights(g, lat, lon);
    return bil(g.elev, 0);
  };

  /* out: {valid, u, v, terrain, pblh, precip, rh, cloud, ws10, grid} */
  M.sample = function (lat, lon, zMSL, tMs, out) {
    const g = M.gridFor(lat, lon);
    if (!g) { out.valid = false; return out; }
    let ft = (tMs - g.t0) / 3600e3;
    if (ft < 0 || ft > g.nt - 1) { out.valid = false; return out; }
    let it = Math.floor(ft);
    if (it >= g.nt - 1) it = g.nt - 2;
    const wt = ft - it, w0 = 1 - wt;
    weights(g, lat, lon);
    const np = g.npts;
    const terr = bil(g.elev, 0);
    const q0 = it * np, q1 = (it + 1) * np;
    out.terrain = terr;
    out.pblh = w0 * bil(g.pblh, q0) + wt * bil(g.pblh, q1);
    out.precip = w0 * bil(g.precip, q0) + wt * bil(g.precip, q1);
    out.rh = w0 * bil(g.rh, q0) + wt * bil(g.rh, q1);
    out.cloud = w0 * bil(g.cloud, q0) + wt * bil(g.cloud, q1);
    out.grid = g.id;
    const base0 = it * NL * np, base1 = (it + 1) * NL * np;
    const u10 = w0 * bil(g.u, base0) + wt * bil(g.u, base1);
    const v10 = w0 * bil(g.v, base0) + wt * bil(g.v, base1);
    out.ws10 = Math.hypot(u10, v10);
    const z10 = terr + 10;
    if (zMSL <= z10) {
      const zagl = Math.max(0.5, zMSL - terr);
      const f = U.clamp(Math.log(zagl / Z0) / Math.log(10 / Z0), 0.1, 1);
      out.u = u10 * f; out.v = v10 * f;
    } else {
      let lo = 0, zlo = z10, hi = -1, zhi = 0;
      for (let l = 1; l < NL; l++) {
        const zl = LEVELS[l].z;
        if (zl <= z10) continue;          // level is below the terrain surface here
        if (zl >= zMSL) { hi = l; zhi = zl; break; }
        lo = l; zlo = zl;
      }
      const ulo = lo === 0 ? u10 : w0 * bil(g.u, base0 + lo * np) + wt * bil(g.u, base1 + lo * np);
      const vlo = lo === 0 ? v10 : w0 * bil(g.v, base0 + lo * np) + wt * bil(g.v, base1 + lo * np);
      if (hi < 0) { out.u = ulo; out.v = vlo; } else {
        const uhi = w0 * bil(g.u, base0 + hi * np) + wt * bil(g.u, base1 + hi * np);
        const vhi = w0 * bil(g.v, base0 + hi * np) + wt * bil(g.v, base1 + hi * np);
        const f = (zMSL - zlo) / (zhi - zlo);
        out.u = ulo + (uhi - ulo) * f; out.v = vlo + (vhi - vlo) * f;
      }
    }
    out.valid = true;
    return out;
  };

  /* wind at a named level (for the wind-vector layer) at grid node p of grid g */
  M.levelWindAtNode = function (g, p, levelIdx, tMs) {
    let ft = U.clamp((tMs - g.t0) / 3600e3, 0, g.nt - 1);
    let it = Math.floor(ft); if (it >= g.nt - 1) it = g.nt - 2;
    const wt = ft - it, np = g.npts;
    const i0 = (it * NL + levelIdx) * np + p, i1 = ((it + 1) * NL + levelIdx) * np + p;
    return [g.u[i0] * (1 - wt) + g.u[i1] * wt, g.v[i0] * (1 - wt) + g.v[i1] * wt];
  };
  M.scalarAtNode = function (g, field, p, tMs) {
    let ft = U.clamp((tMs - g.t0) / 3600e3, 0, g.nt - 1);
    let it = Math.floor(ft); if (it >= g.nt - 1) it = g.nt - 2;
    const wt = ft - it, np = g.npts;
    return g[field][it * np + p] * (1 - wt) + g[field][(it + 1) * np + p] * wt;
  };

  /* ---------------- point forecast + air quality for the CanSat site ---------------- */
  const POINT_VARS = ['temperature_2m', 'relative_humidity_2m', 'surface_pressure', 'precipitation', 'weather_code', 'visibility',
    'cape', 'cloud_cover', 'wind_speed_10m', 'wind_speed_80m', 'wind_speed_120m', 'wind_direction_10m', 'wind_direction_80m',
    'wind_direction_120m', 'wind_gusts_10m', 'boundary_layer_height'];
  const AQ_VARS = ['pm10', 'pm2_5', 'sulphur_dioxide', 'carbon_dioxide'];

  M.fetchPoint = async function (lat, lon) {
    const model = M.model === 'climatology' ? 'gfs_seamless' : M.model;
    const out = { lat, lon, source: 'open-meteo', model };
    const pq = M.periodQuery();
    const base = `https://${pq.host}/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&models=${model}&wind_speed_unit=ms&timeformat=unixtime${pq.qs}`;
    let r = null;
    try { r = await fetchJSON(`${base}&hourly=${POINT_VARS.join(',')}`, 2); }
    catch (e) {
      // some archives lack a few variables — retry with the essential set before giving up
      try { r = await fetchJSON(`${base}&hourly=${POINT_VARS.filter((v) => !/visibility|cape|weather_code/.test(v)).join(',')}`, 2); }
      catch (e2) { out.error = e2.message; }
    }
    if (r) {
      out.elev = r.elevation;
      out.t0 = r.hourly.time[0] * 1000;
      out.nt = r.hourly.time.length;
      out.h = r.hourly;
    } else {
      out.source = 'climatology';
      out.elev = 430;
      out.t0 = M.t0 || Math.floor(Date.now() / 3600e3) * 3600e3 - 24 * 3600e3;
      out.nt = M.nt || 96;
      out.h = climPoint(lat, lon, out.t0, out.nt);
    }
    try {
      // CAMS archive: 2013-01-01 → about 6 days ahead; clip the request to that window
      let aqq = '&past_days=1&forecast_days=3';
      if (pq.s !== undefined) {
        const s = Math.max(pq.s, Date.parse('2013-01-01T00:00:00Z')), e = Math.min(pq.e, todayUTC() + 6 * DAY);
        aqq = s <= e ? `&start_date=${ymd(s)}&end_date=${ymd(e)}` : null;
      }
      if (aqq) {
        const q = await fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
          `&hourly=${AQ_VARS.join(',')}&timeformat=unixtime${aqq}`, 2);
        out.aq = { t0: q.hourly.time[0] * 1000, nt: q.hourly.time.length, h: q.hourly, source: 'CAMS global (Open-Meteo Air Quality)' };
      } else out.aq = null;
    } catch (e) {
      out.aq = null;
    }
    return out;
  };

  function climPoint(lat, lon, t0, nt) {
    const reg = D.climatology.regimes[D.climatology.byMonth[new Date(t0).getUTCMonth()]];
    const h = {}; POINT_VARS.forEach((k) => (h[k] = []));
    for (let t = 0; t < nt; t++) {
      const tm = t0 + t * 3600e3;
      const lst = ((tm / 3.6e6 + lon / 15) % 24 + 24) % 24;
      const day = lst >= 8 && lst <= 17 ? Math.sin(Math.PI * (lst - 8) / 9) : 0;
      const [d0, s0] = reg.lv[0];
      const s10 = s0 * (0.6 + 0.6 * day);
      h.temperature_2m.push(24 + 7 * day); h.relative_humidity_2m.push(88 - 25 * day);
      h.surface_pressure.push(962); h.precipitation.push(0); h.weather_code.push(2); h.visibility.push(20000);
      h.cape.push(800 + 900 * day); h.cloud_cover.push(45);
      h.wind_speed_10m.push(s10); h.wind_speed_80m.push(s10 * 1.35); h.wind_speed_120m.push(s10 * 1.45);
      h.wind_direction_10m.push(d0); h.wind_direction_80m.push(d0 + 8); h.wind_direction_120m.push(d0 + 12);
      h.wind_gusts_10m.push(s10 * 1.8); h.boundary_layer_height.push(diurnalPBL(tm, lon));
    }
    return h;
  }

  /* value of an hourly point series at time t (linear interpolation; circular for directions) */
  M.pointValue = function (pt, key, tMs, isDir) {
    const src = pt.h, arr = src && src[key];
    if (!arr) return NaN;
    const ft = U.clamp((tMs - pt.t0) / 3600e3, 0, pt.nt - 1);
    const i = Math.floor(ft), j = Math.min(i + 1, pt.nt - 1), w = ft - i;
    const a = arr[i], b = arr[j];
    if (a === null || a === undefined) return b === null || b === undefined ? NaN : b;
    if (b === null || b === undefined) return a;
    if (isDir) {
      const [ua, va] = U.wsWdToUV(1, a), [ub, vb] = U.wsWdToUV(1, b);
      return U.uvToWsWd(ua * (1 - w) + ub * w, va * (1 - w) + vb * w)[1];
    }
    return a * (1 - w) + b * w;
  };
  M.aqValue = function (pt, key, tMs) {
    if (!pt.aq || tMs < pt.aq.t0 - 3600e3 || tMs > pt.aq.t0 + pt.aq.nt * 3600e3) return NaN;
    return M.pointValue({ h: pt.aq.h, t0: pt.aq.t0, nt: pt.aq.nt }, key, tMs);
  };

  M.diurnalPBL = diurnalPBL;
  AERIS.met = M;
})();

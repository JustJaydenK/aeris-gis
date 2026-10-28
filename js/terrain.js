/* AERIS-GIS — terrain analysis (QGIS "Raster ▸ Analysis" style).
   DEM download (Copernicus GLO-30 / GLO-90 and NASADEM through Microsoft Planetary Computer, or AWS Terrain
   Tiles), elevation heat map, hillshade, slope, aspect, contour lines and contour polygons, elevation profile with
   a 433 MHz LoRa line-of-sight check, raster statistics, and QGIS-ready exports (ASCII grid, GeoJSON, PNG + world file).
   Every DEM is resampled onto a Web-Mercator cell grid, so the map overlay is geometrically exact. */
(function () {
  'use strict';
  const U = AERIS.U, UI = AERIS.ui, D = AERIS.data, A = AERIS.app, S = A.S, el = U.el, DEG = U.DEG;
  const T = AERIS.terrain = { dem: null, img: {}, keys: {}, loading: false };
  const LAYER_IDS = T.LAYER_IDS = ['dem-contours', 'dem-bands', 'dem-hill', 'dem-relief', 'dem-slope', 'dem-aspect'];
  const PANE = { 'dem-relief': 'terrainRelief', 'dem-slope': 'terrainRelief', 'dem-aspect': 'terrainRelief', 'dem-hill': 'terrainHill' };
  // local copy first (works offline / in the desktop app), CDN as fallback
  const GEOTIFF = ['vendor/geotiff.min.js', 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js'];
  const PC_SIGN = 'https://planetarycomputer.microsoft.com/api/sas/v1/sign?href=';

  Object.assign(UI.icons, {
    terrain: '<path d="M1.5 20.5l6.5-11 4 6 3.2-4.4 7.3 9.4z" fill="#a1887f" stroke="#4e342e" stroke-width="1"/><path d="M8 9.5l1.9 3M15.2 11.1l1.5 2" stroke="#fff" stroke-width="1.1"/><path d="M2.5 6.5c3-2 5.5 1 8.5-1s5.5 1 10-1.2" fill="none" stroke="#2e7d32" stroke-width="1.3"/>',
    profile: '<path d="M2 20.5h20" stroke="#555" stroke-width="1.2"/><path d="M2 17l4-5.5 3 3 5-8.5 4 5.5 4-2.5v11H2z" fill="#bcaaa4" stroke="#5d4037" stroke-width="1"/><path d="M2 8.5h20" stroke="#6a1b9a" stroke-width="1.3" stroke-dasharray="2.2 1.8"/>'
  });

  /* ============================== sources ============================== */
  const p2 = (n) => String(Math.abs(n)).padStart(2, '0'), p3 = (n) => String(Math.abs(n)).padStart(3, '0');
  const SRC = T.SOURCES = {
    cop30: { name: 'Copernicus DEM GLO-30 (≈ 30 m)', short: 'Copernicus GLO-30', kind: 'cog', res: 30, maxTiles: 16,
      href: (la, lo) => `https://elevationeuwest.blob.core.windows.net/copernicus-dem/COP30_hh/Copernicus_DSM_COG_10_${la < 0 ? 'S' : 'N'}${p2(la)}_00_${lo < 0 ? 'W' : 'E'}${p3(lo)}_00_DEM.tif`,
      attr: 'Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA',
      info: 'ESA TanDEM-X radar surface model (2011–2015). It is a surface model: tree canopy and buildings are included. Heights are above the EGM2008 geoid.' },
    cop90: { name: 'Copernicus DEM GLO-90 (≈ 90 m)', short: 'Copernicus GLO-90', kind: 'cog', res: 90, maxTiles: 36,
      href: (la, lo) => `https://elevationeuwest.blob.core.windows.net/copernicus-dem/COP90_hh/Copernicus_DSM_COG_30_${la < 0 ? 'S' : 'N'}${p2(la)}_00_${lo < 0 ? 'W' : 'E'}${p3(lo)}_00_DEM.tif`,
      attr: 'Copernicus DEM GLO-90 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA',
      info: 'The same TanDEM-X model at 3 arc-seconds. Use it for large areas such as all of Davao Region.' },
    nasadem: { name: 'NASADEM (NASA, 1″ ≈ 30 m)', short: 'NASADEM', kind: 'cog', res: 30, maxTiles: 16, nodata: -32768,
      href: (la, lo) => `https://nasademeuwest.blob.core.windows.net/nasadem-cog/v001/NASADEM_HGT_${la < 0 ? 's' : 'n'}${p2(la)}${lo < 0 ? 'w' : 'e'}${p3(lo)}.tif`,
      attr: 'NASADEM Merged DEM Global 1 arc second V001 (NASA JPL, 2020; NASA EOSDIS LP DAAC)',
      info: 'Reprocessed SRTM radar elevation from February 2000, void-filled. Heights are above the EGM96 geoid.' },
    terrarium: { name: 'AWS Terrain Tiles (Terrarium, fast)', short: 'Terrain Tiles', kind: 'tiles', res: 30, maxZ: 14,
      tile: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
      attr: 'Terrain Tiles: Mapzen / AWS Open Data (SRTM, GMTED2010, ETOPO1)',
      info: 'A pre-tiled global mosaic, mostly SRTM over the Philippines. The fastest option, and it works for any map extent.' }
  };
  const FALLBACK = { cop30: 'cop90', nasadem: 'cop90', cop90: 'terrarium' };
  const AREAS = [['view', 'Current map view'], ['site', 'CanSat site (± 3 km)'], ['priority', 'Mt. Apo & Mt. Leonard Kniaseff'],
    ['apo', 'Mt. Apo (± 15 km)'], ['leonard', 'Mt. Leonard Kniaseff (± 15 km)']];
  const DETAIL = { coarse: 600, normal: 1000, fine: 1400 };

  /* ============================== style state ============================== */
  const DEF = { source: 'cop30', area: 'view', detail: 'normal',
    ramp: 'turbo', stretch: 'p2', min: 0, max: 3000, hideSea: true, reliefOpacity: 0.75,
    az: 315, alt: 45, zf: 1.5, multi: false, hillOpacity: 0.6, hillBlend: 'multiply',
    interval: 'auto', indexEvery: 5, labels: true, lineColor: '#5d4037', lineOpacity: 0.9, bandOpacity: 0.55,
    slopeOpacity: 0.7, aspectOpacity: 0.7 };
  const st = T.style = Object.assign({}, DEF, U.lsGet('aeris.terrain', {}));
  const save = () => U.lsSet('aeris.terrain', st);

  const RAMPS = T.RAMPS = {
    turbo: { name: 'Heat (Turbo)', c: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a', '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0403'] },
    terrain: { name: 'Terrain (hypsometric)', c: ['#3a7d44', '#6aab4f', '#a9cf6a', '#e8e59a', '#d9b56c', '#b98a4e', '#8c6239', '#a89a8e', '#ffffff'] },
    viridis: { name: 'Viridis', c: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'] },
    magma: { name: 'Magma', c: ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55964', '#fb8761', '#fec287', '#fcfdbf'] },
    spectral: { name: 'Spectral (blue → red)', c: ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#fee08b', '#fdae61', '#f46d43', '#d53e4f'] },
    greys: { name: 'Greys', c: ['#111111', '#ffffff'] }
  };
  const SLOPE = [{ max: 5, c: '#1a9641', l: '0–5° flat to gentle' }, { max: 10, c: '#a6d96a', l: '5–10°' }, { max: 15, c: '#ffffbf', l: '10–15°' },
    { max: 25, c: '#fdae61', l: '15–25°' }, { max: 35, c: '#e34a33', l: '25–35°' }, { max: 45, c: '#b30000', l: '35–45°' }, { max: 91, c: '#4d0000', l: '> 45° very steep' }];
  const ASPECT = [['N', '#e41a1c'], ['NE', '#ff7f00'], ['E', '#ffd92f'], ['SE', '#4daf4a'], ['S', '#00bcd4'], ['SW', '#377eb8'], ['W', '#984ea3'], ['NW', '#f781bf']];
  const FLAT = '#bdbdbd';
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lutCache = {};
  function lut(name) {
    if (lutCache[name]) return lutCache[name];
    const c = RAMPS[name].c.map(hex), out = new Uint8Array(256 * 3);
    for (let k = 0; k < 256; k++) {
      const f = k / 255 * (c.length - 1), i = Math.min(c.length - 2, Math.floor(f)), t = f - i;
      for (let q = 0; q < 3; q++) out[k * 3 + q] = c[i][q] + (c[i + 1][q] - c[i][q]) * t;
    }
    return (lutCache[name] = out);
  }
  const rampCSS = (name) => `linear-gradient(90deg,${RAMPS[name].c.join(',')})`;
  function rampColor(name, t) {
    const L = lut(name), k = Math.round(U.clamp(t, 0, 1) * 255) * 3;
    return `rgb(${L[k]},${L[k + 1]},${L[k + 2]})`;
  }

  /* ============================== Web-Mercator grid ============================== */
  const MPP0 = 2 * Math.PI * 6378137 / 256;               // EPSG:3857 metres per world pixel at z = 0
  const WORLD = (z) => 256 * Math.pow(2, z);
  const toWP = (lat, lon, z) => { const n = WORLD(z), r = lat * DEG; return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n]; };
  const fromWP = (x, y, z) => { const n = WORLD(z); return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / DEG, x / n * 360 - 180]; };
  T.toWP = toWP; T.fromWP = fromWP;

  function makeGrid(b, maxPx, resM) {
    const latC = (b.s + b.n) / 2;
    const [xa, ya] = toWP(b.n, b.w, 0), [xb, yb] = toWP(b.s, b.e, 0);
    const zFit = Math.log2(maxPx / Math.max(xb - xa, yb - ya));
    const zNative = Math.log2(MPP0 * Math.cos(latC * DEG) / resM);
    const z = Math.min(zFit, zNative);
    const [x0, y0] = toWP(b.n, b.w, z), [x1, y1] = toWP(b.s, b.e, z);
    const g = { z, x0: Math.floor(x0), y0: Math.floor(y0) };
    g.W = Math.max(3, Math.ceil(x1) - g.x0); g.H = Math.max(3, Math.ceil(y1) - g.y0);
    g.data = new Float32Array(g.W * g.H).fill(NaN);
    const [latN, lonW] = fromWP(g.x0, g.y0, z), [latS, lonE] = fromWP(g.x0 + g.W, g.y0 + g.H, z);
    g.bounds = { n: latN, s: latS, w: lonW, e: lonE };
    g.cell = MPP0 / Math.pow(2, z);                        // EPSG:3857 cell size (m)
    g.rowLat = new Float64Array(g.H); g.rowM = new Float32Array(g.H); g.colLon = new Float64Array(g.W);
    for (let j = 0; j < g.H; j++) { g.rowLat[j] = fromWP(0, g.y0 + j + 0.5, z)[0]; g.rowM[j] = g.cell * Math.cos(g.rowLat[j] * DEG); }
    for (let i = 0; i < g.W; i++) g.colLon[i] = fromWP(g.x0 + i + 0.5, 0, z)[1];
    return g;
  }
  /* NaN-aware bilinear sample of a W×H array at fractional cell (fx, fy), cell centres at integers */
  function bilinear(d, W, H, fx, fy) {
    const i = U.clamp(Math.floor(fx), 0, W - 2), j = U.clamp(Math.floor(fy), 0, H - 2);
    const ax = U.clamp(fx - i, 0, 1), ay = U.clamp(fy - j, 0, 1);
    const a = d[j * W + i], b = d[j * W + i + 1], c = d[(j + 1) * W + i], e = d[(j + 1) * W + i + 1];
    if (a === a && b === b && c === c && e === e) return a * (1 - ax) * (1 - ay) + b * ax * (1 - ay) + c * (1 - ax) * ay + e * ax * ay;
    const near = [[a, (1 - ax) * (1 - ay)], [b, ax * (1 - ay)], [c, (1 - ax) * ay], [e, ax * ay]].filter((p) => p[0] === p[0]).sort((p, q) => q[1] - p[1]);
    return near.length ? near[0][0] : NaN;
  }
  T.elevAt = function (lat, lon, g) {
    g = g || T.dem;
    if (!g) return NaN;
    const [x, y] = toWP(lat, lon, g.z);
    const fx = x - g.x0 - 0.5, fy = y - g.y0 - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > g.W - 0.5 || fy > g.H - 0.5) return NaN;
    return bilinear(g.data, g.W, g.H, fx, fy);
  };
  const covers = (g, lat, lon) => !!g && lat <= g.bounds.n && lat >= g.bounds.s && lon >= g.bounds.w && lon <= g.bounds.e;

  /* ============================== loading ============================== */
  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some((s) => s.src === src)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  let geotiffP = null;
  function loadGeoTIFF() {
    if (window.GeoTIFF) return Promise.resolve();
    if (!geotiffP) geotiffP = (async () => { let err; for (const s of GEOTIFF) { try { await loadScript(s); return; } catch (e) { err = e; } } geotiffP = null; throw err; })();
    return geotiffP;
  }
  const signed = {};
  async function sign(href) {
    const c = signed[href];
    if (c && c.exp - Date.now() > 5 * 60e3) return c.url;
    const r = await fetch(PC_SIGN + encodeURIComponent(href));
    if (!r.ok) throw new Error('Planetary Computer signing failed (HTTP ' + r.status + ')');
    const j = await r.json();
    signed[href] = { url: j.href, exp: Date.parse(j['msft:expiry']) || Date.now() + 30 * 60e3 };
    return j.href;
  }
  function tileList(b) {
    const out = [];
    for (let la = Math.floor(b.s); la <= Math.floor(b.n - 1e-9); la++) for (let lo = Math.floor(b.w); lo <= Math.floor(b.e - 1e-9); lo++) out.push([la, lo]);
    return out;
  }
  async function loadCOG(src, g, msg) {
    await loadGeoTIFF();
    const b = g.bounds, tiles = tileList(b);
    let done = 0, ok = 0, missing = 0;
    msg(`Loading ${src.short}: 0/${tiles.length} tiles…`);
    await Promise.all(tiles.map(async ([la, lo]) => {
      try {
        const ib = [Math.max(b.w, lo), Math.max(b.s, la), Math.min(b.e, lo + 1), Math.min(b.n, la + 1)];
        let i0 = 0, i1 = g.W - 1, j0 = 0, j1 = g.H - 1;
        while (i0 < g.W && g.colLon[i0] < ib[0]) i0++;
        while (i1 >= 0 && g.colLon[i1] >= ib[2]) i1--;
        while (j0 < g.H && g.rowLat[j0] >= ib[3]) j0++;
        while (j1 >= 0 && g.rowLat[j1] < ib[1]) j1--;
        if (i1 < i0 || j1 < j0) return;
        let tif;
        try { tif = await GeoTIFF.fromUrl(await sign(src.href(la, lo))); } catch (e) { missing++; return; } // no tile = open sea
        const nx = Math.max(2, i1 - i0 + 3), ny = Math.max(2, j1 - j0 + 3);
        const r = await tif.readRasters({ bbox: ib, width: nx, height: ny, resampleMethod: 'bilinear', interleave: true });
        const nd = src.nodata, dlon = ib[2] - ib[0], dlat = ib[3] - ib[1];
        const rr = r instanceof Float32Array && nd === undefined ? r : Float32Array.from(r, (v) => (v === nd ? NaN : v));
        for (let j = j0; j <= j1; j++) {
          const fy = (ib[3] - g.rowLat[j]) / dlat * ny - 0.5;
          for (let i = i0; i <= i1; i++) g.data[j * g.W + i] = bilinear(rr, nx, ny, (g.colLon[i] - ib[0]) / dlon * nx - 0.5, fy);
        }
        ok++;
      } catch (e) { UI.log(`${src.short} tile ${la}°, ${lo}°: ${e.message}`, 'warn', 'Terrain'); }
      finally { done++; msg(`Loading ${src.short}: ${done}/${tiles.length} tiles…`); }
    }));
    if (!ok) throw new Error(missing === tiles.length ? `${src.short} has no tiles here (open sea).` : `${src.short} could not be read. Check the internet connection, or try AWS Terrain Tiles.`);
  }
  function loadImg(url) {
    return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
  }
  async function loadTiles(src, g, msg) {
    const tz = U.clamp(Math.round(g.z), 0, src.maxZ), f = Math.pow(2, tz - g.z), nT = Math.pow(2, tz);
    const tx0 = Math.floor(g.x0 * f / 256), ty0 = Math.floor(g.y0 * f / 256);
    const tx1 = Math.floor((g.x0 + g.W) * f / 256), ty1 = Math.floor((g.y0 + g.H) * f / 256);
    const cols = tx1 - tx0 + 1, rows = ty1 - ty0 + 1;
    if (cols * rows > 400) throw new Error('Area too large for Terrain Tiles; zoom in a little.');
    const cv = document.createElement('canvas'); cv.width = cols * 256; cv.height = rows * 256;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    let done = 0;
    const jobs = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
      if (y < 0 || y >= nT) continue;
      jobs.push(loadImg(src.tile(tz, ((x % nT) + nT) % nT, y)).then((im) => { if (im) ctx.drawImage(im, (x - tx0) * 256, (y - ty0) * 256); msg(`Loading ${src.short}: ${++done}/${jobs.length} tiles…`); return !!im; }));
    }
    if (!(await Promise.all(jobs)).some(Boolean)) throw new Error('Terrain Tiles could not be loaded (offline?).');
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data, MW = cv.width, MH = cv.height;
    const mos = new Float32Array(MW * MH);
    for (let k = 0; k < MW * MH; k++) mos[k] = px[k * 4 + 3] ? px[k * 4] * 256 + px[k * 4 + 1] + px[k * 4 + 2] / 256 - 32768 : NaN;
    for (let j = 0; j < g.H; j++) {
      const fy = (g.y0 + j + 0.5) * f - ty0 * 256 - 0.5;
      for (let i = 0; i < g.W; i++) g.data[j * g.W + i] = bilinear(mos, MW, MH, (g.x0 + i + 0.5) * f - tx0 * 256 - 0.5, fy);
    }
  }
  function computeStats(g) {
    let mn = Infinity, mx = -Infinity, s = 0, s2 = 0, n = 0, area = 0, land = 0;
    const step = Math.max(1, Math.floor(g.data.length / 250000)), smp = [];
    for (let j = 0; j < g.H; j++) {
      const a = g.rowM[j] * g.rowM[j];
      for (let i = 0; i < g.W; i++) {
        const k = j * g.W + i, v = g.data[k];
        if (v !== v) continue;
        if (v < mn) mn = v; if (v > mx) mx = v;
        s += v; s2 += v * v; n++; area += a; if (v > 0) land += a;
        if (k % step === 0) smp.push(v);
      }
    }
    smp.sort((a, b) => a - b);
    const q = (p) => (smp.length ? smp[Math.min(smp.length - 1, Math.floor(p * smp.length))] : NaN);
    Object.assign(g, { min: mn, max: mx, mean: s / n, std: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)), valid: n, areaKm2: area / 1e6, landKm2: land / 1e6, p2: q(0.02), p98: q(0.98), median: q(0.5) });
  }
  function viewBounds() {
    const b = S.map.getBounds();
    return { n: Math.min(84, b.getNorth()), s: Math.max(-84, b.getSouth()), w: Math.max(-180, b.getWest()), e: Math.min(180, b.getEast()) };
  }
  function areaBounds(key) {
    const box = (lat, lon, km) => {
      const [n, e] = U.offsetLL(lat, lon, km * 1000, km * 1000), [s, w] = U.offsetLL(lat, lon, -km * 1000, -km * 1000);
      return { n, s, e, w };
    };
    if (key === 'site') return box(S.cfg.site.lat, S.cfg.site.lon, 3);
    if (key === 'priority') return { s: 6.75, w: 124.95, n: 7.75, e: 126.35 };
    if (key === 'apo' || key === 'leonard') { const v = D.volcanoById(key); if (v) return box(v.lat, v.lon, 15); }
    return viewBounds();
  }
  /* pick a source that can serve this area: 30 m → 90 m → Terrain Tiles */
  function fitSource(id, b) {
    let s = id;
    while (SRC[s].kind === 'cog' && tileList(b).length > SRC[s].maxTiles && FALLBACK[s]) s = FALLBACK[s];
    return s;
  }
  T.fetchGrid = async function (b, srcId, detail, msg = () => {}) {
    const src = SRC[srcId];
    const g = makeGrid(b, DETAIL[detail] || DETAIL.normal, src.res);
    if (src.kind === 'cog') await loadCOG(src, g, msg); else await loadTiles(src, g, msg);
    computeStats(g);
    if (!g.valid) throw new Error('The DEM has no valid cells in this area.');
    g.source = srcId;
    return g;
  };
  T.load = async function (opts = {}) {
    if (T.loading) { UI.message('Terrain', 'A DEM is already loading…', 'info', 3000); return; }
    const areaKey = opts.area || st.area;
    const b = opts.bounds || areaBounds(areaKey);
    const want = opts.source || st.source, srcId = fitSource(want, b);
    T.loading = true;
    renderDialogStatus();
    A.busy(`Loading ${SRC[srcId].short}…`);
    try {
      const g = await T.fetchGrid(b, srcId, opts.detail || st.detail, (m) => A.busy(m));
      g.areaLabel = opts.areaLabel || (AREAS.find((a) => a[0] === areaKey) || AREAS[0])[1];
      if (T.dem && S.map.attributionControl) S.map.attributionControl.removeAttribution(SRC[T.dem.source].attr);
      T.dem = g; T.keys = {}; T.cont = null;
      S.map.attributionControl.addAttribution(SRC[srcId].attr);
      if (!LAYER_IDS.some((id) => A.LAYERS[id].visible)) ['dem-relief', 'dem-hill', 'dem-contours'].forEach((id) => (A.LAYERS[id].visible = true));
      A.LAYERS['g-terrain'].visible = true;
      LAYER_IDS.forEach((id) => A.syncLayer(id));
      renameLayers();
      if (areaKey !== 'view' && !opts.bounds && !opts.noZoom) S.map.fitBounds([[b.s, b.w], [b.n, b.e]]);
      const res = g.rowM[g.H >> 1];
      const note = srcId !== want ? ` (${SRC[want].short} needs too many tiles for this area, so ${SRC[srcId].short} was used; zoom in for 30 m data)` : '';
      UI.message('Terrain', `Loaded ${U.esc(SRC[srcId].short)} for ${U.esc(g.areaLabel)}: ${g.W} × ${g.H} cells at ≈ ${res.toFixed(0)} m, elevation ${U.fmtNum(g.min)}–${U.fmtNum(g.max)} m${U.esc(note)}.`, 'ok', 8000);
      UI.log(`DEM ${SRC[srcId].short}: ${g.W}×${g.H}, ${res.toFixed(1)} m, ${g.min.toFixed(0)}–${g.max.toFixed(0)} m, ${g.areaLabel}`, 'ok', 'Terrain');
      await T.render();
    } catch (e) {
      UI.message('Terrain', U.esc(e.message), 'err', 0, { label: 'Use Terrain Tiles', run: () => T.load(Object.assign({}, opts, { source: 'terrarium' })) });
      UI.log('DEM: ' + e.message, 'err', 'Terrain');
    } finally {
      T.loading = false; A.busy(null);
      A.renderTree(); renderDialogStatus(); syncDialogLayers();
    }
  };
  function renameLayers() {
    const s = T.dem ? ` — ${SRC[T.dem.source].short}` : '';
    const L = A.LAYERS;
    L['dem-relief'].name = 'Elevation heat map' + s;
    L['dem-hill'].name = 'Hillshade' + s;
    L['dem-slope'].name = 'Slope (°)' + s;
    L['dem-aspect'].name = 'Aspect' + s;
    L['dem-contours'].name = `Contour lines${T.dem ? ` (${levels(T.dem).iv} m)` : ''}`;
    L['dem-bands'].name = `Contour polygons${T.dem ? ` (${levels(T.dem).iv} m bands)` : ''}`;
  }
  T.clear = function () {
    if (T.dem && S.map.attributionControl) S.map.attributionControl.removeAttribution(SRC[T.dem.source].attr);
    LAYER_IDS.forEach((id) => S.lg[id] && S.lg[id].clearLayers());
    Object.values(T.img).forEach((o) => URL.revokeObjectURL(o.url));
    T.img = {}; T.keys = {}; T.cont = null; T.dem = null;
    renameLayers(); A.renderTree(); renderDialogStatus();
  };

  /* ============================== derived rasters ============================== */
  function gradients(g) {
    if (g.gx) return;
    const W = g.W, H = g.H, d = g.data;
    const gx = (g.gx = new Float32Array(W * H)), gy = (g.gy = new Float32Array(W * H));
    for (let j = 0; j < H; j++) {
      const jm = j > 0 ? j - 1 : j, jp = j < H - 1 ? j + 1 : j, m = g.rowM[j];
      for (let i = 0; i < W; i++) {
        const k = j * W + i, c = d[k];
        if (c !== c) { gx[k] = gy[k] = NaN; continue; }
        const im = i > 0 ? i - 1 : i, ip = i < W - 1 ? i + 1 : i;
        const v = (ii, jj) => { const x = d[jj * W + ii]; return x === x ? x : c; };
        const a = v(im, jm), b = v(i, jm), e = v(ip, jm), f = v(im, j), h = v(ip, j), p = v(im, jp), q = v(i, jp), r = v(ip, jp);
        gx[k] = ((e + 2 * h + r) - (a + 2 * f + p)) / (4 * m * (ip - im));   // Horn (1981): dz/d(east)
        gy[k] = ((a + 2 * b + e) - (p + 2 * q + r)) / (4 * m * (jp - jm));   // dz/d(north)
      }
    }
  }
  const slopeDeg = (gx, gy) => Math.atan(Math.hypot(gx, gy)) / DEG;
  const aspectDeg = (gx, gy) => (Math.atan2(-gx, -gy) / DEG + 360) % 360;   // direction the slope faces (downhill)
  function stretch(g) {
    if (st.stretch === 'custom' && st.max > st.min) return [st.min, st.max];
    if (st.stretch === 'minmax') return [st.hideSea ? Math.max(0, g.min) : g.min, g.max];
    return [st.hideSea ? Math.max(0, g.p2) : g.p2, g.p98];
  }
  T.stretch = () => (T.dem ? stretch(T.dem) : [0, 1]);
  function rgbaRelief(g) {
    const L = lut(st.ramp), [lo, hi] = stretch(g), sc = 255 / Math.max(1e-6, hi - lo), out = new Uint8ClampedArray(g.W * g.H * 4);
    for (let k = 0; k < g.data.length; k++) {
      const v = g.data[k];
      if (v !== v || (st.hideSea && v <= 0)) continue;
      const q = Math.round(U.clamp((v - lo) * sc, 0, 255)) * 3;
      out[k * 4] = L[q]; out[k * 4 + 1] = L[q + 1]; out[k * 4 + 2] = L[q + 2]; out[k * 4 + 3] = 255;
    }
    return out;
  }
  function rgbaHill(g) {
    gradients(g);
    const out = new Uint8ClampedArray(g.W * g.H * 4), alt = st.alt * DEG, zf = st.zf;
    const dirs = (st.multi ? [225, 270, 315, 360] : [st.az]).map((a) => [Math.sin(a * DEG) * Math.cos(alt), Math.cos(a * DEG) * Math.cos(alt)]);
    const sAlt = Math.sin(alt);
    for (let k = 0; k < g.data.length; k++) {
      const x = g.gx[k] * zf, y = g.gy[k] * zf;
      if (x !== x || (st.hideSea && g.data[k] <= 0)) continue;
      const nrm = Math.sqrt(x * x + y * y + 1);
      let sh = 0;
      for (const [se, sn] of dirs) sh += Math.max(0, (sAlt - x * se - y * sn) / nrm);
      const v = 255 * sh / dirs.length;
      out[k * 4] = out[k * 4 + 1] = out[k * 4 + 2] = v; out[k * 4 + 3] = 255;
    }
    return out;
  }
  function rgbaSlope(g) {
    gradients(g);
    const cols = SLOPE.map((s) => hex(s.c)), out = new Uint8ClampedArray(g.W * g.H * 4);
    for (let k = 0; k < g.data.length; k++) {
      const x = g.gx[k];
      if (x !== x || (st.hideSea && g.data[k] <= 0)) continue;
      const s = slopeDeg(x, g.gy[k]);
      const c = cols[SLOPE.findIndex((q) => s < q.max)];
      out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; out[k * 4 + 3] = 255;
    }
    return out;
  }
  function rgbaAspect(g) {
    gradients(g);
    const cols = ASPECT.map((a) => hex(a[1])), flat = hex(FLAT), out = new Uint8ClampedArray(g.W * g.H * 4);
    for (let k = 0; k < g.data.length; k++) {
      const x = g.gx[k], y = g.gy[k];
      if (x !== x || (st.hideSea && g.data[k] <= 0)) continue;
      const c = slopeDeg(x, y) < 2 ? flat : cols[Math.round(aspectDeg(x, y) / 45) % 8];
      out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; out[k * 4 + 3] = 255;
    }
    return out;
  }
  async function toBlobURL(rgba, W, H) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(new ImageData(rgba, W, H), 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    return { url: URL.createObjectURL(blob), cv };
  }
  async function putImage(id, rgba, g, opacity) {
    const { url } = await toBlobURL(rgba, g.W, g.H);
    const bounds = L.latLngBounds([[g.bounds.s, g.bounds.w], [g.bounds.n, g.bounds.e]]);
    const lg = S.lg[id], old = T.img[id];
    if (old && lg.hasLayer(old.ov)) { old.ov.setUrl(url); old.ov.setBounds(bounds); old.ov.setOpacity(opacity); URL.revokeObjectURL(old.url); old.url = url; return; }
    if (old) URL.revokeObjectURL(old.url);
    lg.clearLayers();
    const ov = L.imageOverlay(url, bounds, { pane: PANE[id], opacity, interactive: false, className: 'dem-img' });
    lg.addLayer(ov);
    T.img[id] = { ov, url };
  }

  /* ============================== contours ============================== */
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function levels(g) {
    const lo0 = st.hideSea ? Math.max(0, g.min) : g.min;
    let iv = st.interval === 'auto' ? niceStep(Math.max(1, (g.max - lo0) / 25)) : +st.interval;
    while ((g.max - lo0) / iv > 300) iv *= 2;
    const lv = [];
    for (let v = Math.ceil(lo0 / iv) * iv; v <= g.max; v += iv) lv.push(+v.toFixed(3));
    return { iv, lv, base: st.hideSea ? 0 : g.min - 0.5 };
  }
  /* downsampled (≤ 800 cells) and lightly smoothed copy of the DEM for contour tracing */
  function contourGrid(g) {
    if (g.cg) return g.cg;
    const f = Math.max(1, Math.ceil(Math.max(g.W, g.H) / 800)), w = Math.ceil(g.W / f), h = Math.ceil(g.H / f);
    const a = new Float64Array(w * h).fill(NaN);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let j = y * f; j < Math.min(g.H, (y + 1) * f); j++) for (let i = x * f; i < Math.min(g.W, (x + 1) * f); i++) { const v = g.data[j * g.W + i]; if (v === v) { s += v; n++; } }
      if (n) a[y * w + x] = s / n;
    }
    const v = new Float64Array(w * h), sentinel = g.min - 1e4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = a[y * w + x];
      if (c !== c) { v[y * w + x] = sentinel; continue; }
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = a[yy * w + xx]; if (q === q) { const wt = dx || dy ? 1 : 4; s += q * wt; n += wt; }
      }
      v[y * w + x] = s / n;
    }
    return (g.cg = { f, w, h, v });
  }
  function ringArea(r) { let s = 0; for (let k = 0, n = r.length; k < n; k++) { const a = r[k], b = r[(k + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function trace(g) {
    const th = levels(g), key = `${th.iv}|${st.hideSea}`;
    if (T.cont && T.cont.key === key && T.cont.g === g) return T.cont;
    const cg = contourGrid(g);
    const all = [...new Set((th.base > -Infinity && th.base < (th.lv[0] === undefined ? Infinity : th.lv[0]) ? [th.base] : []).concat(th.lv))].sort((a, b) => a - b);
    const polys = d3.contours().size([cg.w, cg.h]).thresholds(all).smooth(true)(Array.from(cg.v));
    const byLevel = new Map();
    polys.forEach((p) => {
      const rings = [];
      p.coordinates.forEach((poly) => poly.forEach((ring) => { if (ring.length >= 4 && Math.abs(ringArea(ring)) >= 1.5) rings.push(ring); }));
      byLevel.set(p.value, rings);
    });
    return (T.cont = { key, g, th, all, byLevel, cg });
  }
  const llOf = (g, cg) => ([x, y]) => { const [la, lo] = fromWP(g.x0 + x * cg.f, g.y0 + y * cg.f, g.z); return [+lo.toFixed(6), +la.toFixed(6)]; };
  /* contour polygons come back closed along the grid edge; drop those edge segments to get true isolines */
  function ringToLines(ring, w, h) {
    const e = 1e-3, side = ([x, y]) => (x <= e ? 1 : 0) | (x >= w - e ? 2 : 0) | (y <= e ? 4 : 0) | (y >= h - e ? 8 : 0);
    const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
    const n = pts.length, edge = (k) => (side(pts[k]) & side(pts[(k + 1) % n])) !== 0;
    let s = -1;
    for (let k = 0; k < n; k++) if (edge(k)) { s = k; break; }
    if (s < 0) return [pts.concat([pts[0]])];
    const out = []; let cur = [];
    for (let m = 1; m <= n; m++) {
      const k = (s + m) % n;
      if (edge(k)) { if (cur.length > 2) out.push(cur); cur = []; continue; }
      if (!cur.length) cur.push(pts[k]);
      cur.push(pts[(k + 1) % n]);
    }
    if (cur.length > 2) out.push(cur);
    return out;
  }
  const isIndex = (v, iv) => st.indexEvery > 0 && Math.abs(Math.round(v / iv) % st.indexEvery) === 0;
  function lineFeatures(c, withLabels) {
    const { g, cg, th } = c, ll = llOf(g, cg), feats = [], cands = [];
    th.lv.forEach((v) => {
      const lines = [];
      (c.byLevel.get(v) || []).forEach((ring) => ringToLines(ring, cg.w, cg.h).forEach((ln) => {
        lines.push(ln.map(ll));
        if (withLabels && ln.length >= 24 && (st.indexEvery === 0 || isIndex(v, th.iv))) cands.push({ v, ln });
      }));
      if (lines.length) feats.push({ type: 'Feature', properties: { ELEV: v, INDEX: isIndex(v, th.iv) }, geometry: { type: 'MultiLineString', coordinates: lines } });
    });
    let labels = [];
    if (withLabels) {
      const used = new Set(), cell = 34;
      cands.sort((a, b) => b.ln.length - a.ln.length);
      for (const cnd of cands) {
        if (labels.length >= 160) break;
        const m = cnd.ln.length >> 1, p = cnd.ln[m], k = `${Math.round(p[0] / cell)},${Math.round(p[1] / cell)}`;
        if (used.has(k)) continue;
        used.add(k);
        const a = cnd.ln[Math.max(0, m - 2)], b = cnd.ln[Math.min(cnd.ln.length - 1, m + 2)];
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        const [lo, la] = ll(p);
        labels.push({ lat: la, lon: lo, ang, v: cnd.v });
      }
    }
    return { type: 'FeatureCollection', features: feats, labels };
  }
  function bandFeatures(c, nested) {
    const { g, cg, all } = c, ll = llOf(g, cg), [lo, hi] = stretch(g), feats = [];
    for (let k = 0; k < all.length; k++) {
      const a = all[k], b = k + 1 < all.length ? all[k + 1] : null;
      const inner = c.byLevel.get(a) || [];
      if (!inner.length) continue;
      const rings = inner.concat(b === null ? [] : (c.byLevel.get(b) || []));
      const top = b === null ? +g.max.toFixed(1) : b, bot = k === 0 && a === c.th.base ? +Math.max(st.hideSea ? 0 : -Infinity, g.min).toFixed(1) : a;
      const color = rampColor(st.ramp, ((bot + top) / 2 - lo) / Math.max(1e-6, hi - lo));
      const coords = nested ? nestRings(rings).map((poly) => poly.map((r) => r.map(ll))) : rings.map((r) => [r.map(ll)]);
      feats.push({ type: 'Feature', properties: { ELEV_MIN: bot, ELEV_MAX: top, _c: color }, geometry: { type: 'MultiPolygon', coordinates: coords } });
    }
    return { type: 'FeatureCollection', features: feats };
  }
  /* even-odd rings → valid polygons (exterior + holes) by nesting depth, for GeoJSON export to QGIS */
  function nestRings(rings) {
    const info = rings.map((r) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      r.forEach(([x, y]) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; });
      return { r, a: Math.abs(ringArea(r)), bb: [x0, y0, x1, y1], depth: 0, parent: -1 };
    });
    const order = info.map((_, i) => i).sort((p, q) => info[q].a - info[p].a);
    const inside = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    order.forEach((i, oi) => {
      const me = info[i], p = me.r[0];
      for (let oj = 0; oj < oi; oj++) {
        const o = info[order[oj]];
        if (o.a <= me.a || p[0] < o.bb[0] || p[0] > o.bb[2] || p[1] < o.bb[1] || p[1] > o.bb[3]) continue;
        if (inside(p, o.r)) { me.depth++; if (me.parent < 0 || info[me.parent].a > o.a) me.parent = order[oj]; }
      }
    });
    const polys = new Map();
    order.forEach((i) => { if (info[i].depth % 2 === 0) polys.set(i, [info[i].r]); });
    order.forEach((i) => { if (info[i].depth % 2 === 1 && polys.has(info[i].parent)) polys.get(info[i].parent).push(info[i].r); });
    return [...polys.values()];
  }

  /* ============================== rendering ============================== */
  const reliefKey = () => `${st.ramp}|${st.stretch}|${st.min}|${st.max}|${st.hideSea}`;
  const lineStyle = (f) => ({ color: st.lineColor, weight: f.properties.INDEX ? 1.6 : 0.8, opacity: st.lineOpacity });
  let chain = Promise.resolve();
  T.render = function () { chain = chain.then(doRender).catch((e) => { console.error(e); UI.log('Terrain render: ' + e.message, 'err', 'Terrain'); }); return chain; };
  async function doRender() {
    const g = T.dem;
    if (!g || !S.map) return;
    const vis = (id) => A.isVisible(id);
    const jobs = [['dem-relief', reliefKey(), rgbaRelief, st.reliefOpacity], ['dem-hill', `${st.az}|${st.alt}|${st.zf}|${st.multi}|${st.hideSea}`, rgbaHill, st.hillOpacity],
      ['dem-slope', `s${st.hideSea}`, rgbaSlope, st.slopeOpacity], ['dem-aspect', `a${st.hideSea}`, rgbaAspect, st.aspectOpacity]];
    for (const [id, key, fn, op] of jobs) {
      if (!vis(id) || T.keys[id] === key) continue;
      A.busy('Rendering terrain…'); await U.sleep0();
      await putImage(id, fn(g), g, op);
      T.keys[id] = key;
    }
    const wantL = vis('dem-contours'), wantB = vis('dem-bands');
    if (wantL || wantB) {
      const th = levels(g), lk = `${th.iv}|${st.hideSea}|${st.indexEvery}|${st.labels}`, bk = `${th.iv}|${st.hideSea}|${reliefKey()}`;
      if ((wantL && T.keys.lines !== lk) || (wantB && T.keys.bands !== bk)) { A.busy('Tracing contours…'); await U.sleep0(); }
      const c = (wantL && T.keys.lines !== lk) || (wantB && T.keys.bands !== bk) ? trace(g) : null;
      if (c && wantL && T.keys.lines !== lk) {
        const fc = lineFeatures(c, st.labels);
        const lg = S.lg['dem-contours']; lg.clearLayers();
        lg.addLayer(L.geoJSON(fc, { pane: 'terrainVec', renderer: T.vec, style: lineStyle,
          onEachFeature: (f, l) => l.bindTooltip(`Contour ${U.fmtNum(f.properties.ELEV)} m${f.properties.INDEX ? ' (index)' : ''}`, { sticky: true, className: 'aeris-tip' }) }));
        fc.labels.forEach((lb) => lg.addLayer(L.marker([lb.lat, lb.lon], { pane: 'terrainLbl', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'dem-clabel', iconSize: [0, 0], html: `<span style="transform:translate(-50%,-50%) rotate(${lb.ang.toFixed(1)}deg)">${U.fmtNum(lb.v)}</span>` }) })));
        T.keys.lines = lk;
      }
      if (c && wantB && T.keys.bands !== bk) {
        const lg = S.lg['dem-bands']; lg.clearLayers();
        lg.addLayer(L.geoJSON(bandFeatures(c, false), { pane: 'terrainVec', renderer: T.vec,
          style: (f) => ({ stroke: true, weight: 0.4, color: 'rgba(0,0,0,0.35)', fillColor: f.properties._c, fillOpacity: st.bandOpacity, fillRule: 'evenodd' }),
          onEachFeature: (f, l) => l.bindTooltip(`Elevation ${U.fmtNum(f.properties.ELEV_MIN)}–${U.fmtNum(f.properties.ELEV_MAX)} m`, { sticky: true, className: 'aeris-tip' }) }));
        T.keys.bands = bk;
      }
      renameLayers();
    }
    labelZoom();
    A.busy(null);
    A.renderTree();
  }
  function labelZoom() {
    if (!S.map) return;
    S.map.getContainer().classList.toggle('dem-nolabels', !T.dem || S.map.getZoom() < T.dem.z - 2.2);
    S.map.getPane('terrainLbl').style.color = st.lineColor;
  }
  /* apply one style change: opacity/colour in place, everything else re-renders what is visible */
  function restyle(key) {
    save();
    const op = { reliefOpacity: 'dem-relief', hillOpacity: 'dem-hill', slopeOpacity: 'dem-slope', aspectOpacity: 'dem-aspect' }[key];
    if (op) { if (T.img[op]) T.img[op].ov.setOpacity(st[key]); return; }
    if (key === 'hillBlend') { S.map.getPane('terrainHill').classList.toggle('blend-multiply', st.hillBlend === 'multiply'); return; }
    if (key === 'lineColor' || key === 'lineOpacity') {
      S.lg['dem-contours'].eachLayer((l) => l.setStyle && l.setStyle(lineStyle));
      labelZoom(); A.renderTree(); return;
    }
    if (key === 'bandOpacity') { S.lg['dem-bands'].eachLayer((l) => l.setStyle && l.setStyle({ fillOpacity: st.bandOpacity })); return; }
    if (key === 'source' || key === 'area' || key === 'detail') return;
    T.render().then(() => { A.renderTree(); renderDialogStatus(); });
  }

  /* ============================== integration hooks ============================== */
  T.init = function (map) {
    LAYER_IDS.forEach((id) => { S.lg[id] = L.layerGroup(); });
    T.vec = L.canvas({ pane: 'terrainVec', padding: 0.4 });
    map.getPane('terrainHill').classList.toggle('blend-multiply', st.hillBlend === 'multiply');
    map.on('zoomend', labelZoom);
    labelZoom();
  };
  A.onVisibility = function (id, v) {
    if (id !== 'g-terrain' && !LAYER_IDS.includes(id)) return;
    if (!LAYER_IDS.some((x) => A.isVisible(x))) return;
    if (!T.dem) { if (v && !T.loading) T.load({ area: 'view' }); return; }
    T.render();
    syncDialogLayers();
  };
  A.extraLegend = function (kind) {
    const row = (sw, txt) => `<div class="lg">${sw}<span>${txt}</span></div>`;
    const box = (c) => `<span class="sw" style="background:${c}"></span>`;
    const g = T.dem;
    if (!kind.startsWith('dem-')) return '';
    if (!g) return '<div class="lg muted">Not loaded. Tick to load the DEM for the current view.</div>';
    if (kind === 'dem-relief') {
      const [lo, hi] = stretch(g);
      return `<div class="lg"><span class="dem-ramp lgr" style="background:${rampCSS(st.ramp)}"></span></div><div class="lg dem-lgl"><span>${U.fmtNum(lo)} m</span><span>${U.fmtNum(hi)} m</span></div>` +
        `<div class="lg muted">${U.esc(RAMPS[st.ramp].name)}; ${st.hideSea ? 'sea hidden' : 'sea shown'}</div>`;
    }
    if (kind === 'dem-hill') return `<div class="lg muted">Sun ${st.multi ? 'from 4 directions' : `azimuth ${st.az}°`}, altitude ${st.alt}°, vertical ×${st.zf}</div>`;
    if (kind === 'dem-slope') return SLOPE.map((s) => row(box(s.c), s.l)).join('');
    if (kind === 'dem-aspect') return ASPECT.map(([n, c]) => row(box(c), `Faces ${n}`)).join('') + row(box(FLAT), 'Flat (< 2°)');
    const th = levels(g);
    if (kind === 'dem-contours') return row(`<span class="sw line" style="background:${st.lineColor};height:3px"></span>`, `Index contour (every ${th.iv * (st.indexEvery || 1)} m)`) +
      row(`<span class="sw line" style="background:${st.lineColor};height:1px"></span>`, `Contour, ${th.iv} m interval`);
    if (kind === 'dem-bands') {
      const [lo, hi] = stretch(g), n = th.lv.length;
      const show = th.lv.filter((_, i) => n <= 10 || i % Math.ceil(n / 10) === 0);
      return show.map((v) => row(box(rampColor(st.ramp, (v + th.iv / 2 - lo) / Math.max(1e-6, hi - lo))), `${U.fmtNum(v)}–${U.fmtNum(v + th.iv)} m`)).join('') +
        (show.length < n ? `<div class="lg muted">${n} bands in total</div>` : '');
    }
    return '';
  };
  A.layerContextExtra = function (n, items) {
    if (n.id !== 'g-terrain' && !LAYER_IDS.includes(n.id)) return;
    items.push('-', { label: 'Terrain Settings…', icon: 'terrain', action: () => T.dialog() },
      { label: 'Load DEM for Current View', icon: 'refresh', action: () => T.load({ area: 'view' }) });
    if (!T.dem) return;
    items.push({ label: 'Raster Statistics & Hypsometry…', icon: 'table', action: () => T.statsWindow() });
    if (n.id === 'dem-contours') items.push({ label: 'Export ▸ Contour Lines as GeoJSON…', icon: 'save', action: () => T.exportContours('lines') });
    if (n.id === 'dem-bands') items.push({ label: 'Export ▸ Contour Polygons as GeoJSON…', icon: 'save', action: () => T.exportContours('bands') });
    if (['dem-relief', 'dem-hill', 'dem-slope', 'dem-aspect'].includes(n.id)) items.push({ label: 'Export ▸ Image + World File (PNG/PGW)…', icon: 'save', action: () => T.exportImage(n.id) });
    items.push({ label: 'Export ▸ DEM as ESRI ASCII Grid…', icon: 'save', action: () => T.exportASC() });
  };
  T.identifyRows = function (lat, lon, rows) {
    const g = T.dem;
    if (!covers(g, lat, lon)) return;
    const z = T.elevAt(lat, lon);
    if (!isFinite(z)) return;
    rows.push(['__grp', `Terrain · ${SRC[g.source].short}`]);
    const datum = { nasadem: 'the EGM96 geoid', cop30: 'the EGM2008 geoid', cop90: 'the EGM2008 geoid' }[g.source] || 'mean sea level';
    rows.push(['Elevation', `${U.fmtNum(z, 1)} m above ${datum}`]);
    gradients(g);
    const [x, y] = toWP(lat, lon, g.z), k = U.clamp(Math.floor(y - g.y0), 0, g.H - 1) * g.W + U.clamp(Math.floor(x - g.x0), 0, g.W - 1);
    if (isFinite(g.gx[k])) {
      const s = slopeDeg(g.gx[k], g.gy[k]);
      rows.push(['Slope', `${s.toFixed(1)}° (${(Math.tan(s * DEG) * 100).toFixed(0)} %)`]);
      if (s >= 2) { const a = aspectDeg(g.gx[k], g.gy[k]); rows.push(['Aspect (faces)', `${a.toFixed(0)}° (${U.compass(a)})`]); }
    }
    const zs = covers(g, S.cfg.site.lat, S.cfg.site.lon) ? T.elevAt(S.cfg.site.lat, S.cfg.site.lon) : NaN;
    if (isFinite(zs)) rows.push(['Height above CanSat launch site', `${z - zs >= 0 ? '+' : ''}${U.fmtNum(z - zs, 1)} m`]);
  };
  T.cursor = function (ll) {
    const c = document.getElementById('sbElev');
    if (!c) return;
    const z = covers(T.dem, ll.lat, ll.lng) ? T.elevAt(ll.lat, ll.lng) : NaN;
    c.textContent = isFinite(z) ? `${U.fmtNum(z)} m` : '—';
  };

  /* ============================== dialog & styling panel ============================== */
  function ctl() {
    const sel = (opts, val, fn) => { const s = el('select'); opts.forEach(([v, l]) => { const o = el('option', { value: v, text: l }); if (String(v) === String(val)) o.selected = true; s.appendChild(o); }); s.addEventListener('change', () => fn(s.value)); return s; };
    const rng = (min, max, step, val, fn, fmt = (v) => v) => {
      const r = el('input', { type: 'range', min, max, step }), lab = el('span', { text: fmt(val) });
      r.value = val; r.addEventListener('input', () => { lab.textContent = fmt(+r.value); fn(+r.value); });
      return el('div', { class: 'rv' }, [r, lab]);
    };
    const chk = (label, val, fn) => { const c = el('input', { type: 'checkbox' }); c.checked = !!val; c.addEventListener('change', () => fn(c.checked)); return el('label', { class: 'chk' }, [c, el('span', { html: label })]); };
    const num = (val, fn, step = 1) => { const i = el('input', { type: 'number', step }); i.value = val; i.addEventListener('change', () => fn(+i.value)); return i; };
    const row = (label, c) => el('div', { class: 'dem-row' }, [el('span', { text: label }), c]);
    const sec = (title, kids) => el('div', { class: 'dem-sec' }, [el('h4', { text: title })].concat(kids));
    return { sel, rng, chk, num, row, sec };
  }
  const pct = (v) => Math.round(v * 100) + ' %';
  function styleSections() {
    const { sel, rng, chk, num, row, sec } = ctl();
    const set = (k) => (v) => { st[k] = v; restyle(k); };
    const prev = el('div', { class: 'dem-ramp', style: { background: rampCSS(st.ramp) } });
    const custom = el('div', { class: st.stretch === 'custom' ? '' : 'hidden' }, [row('Minimum (m)', num(st.min, set('min'), 10)), row('Maximum (m)', num(st.max, set('max'), 10))]);
    const relief = sec('Elevation heat map', [
      row('Colour ramp', el('div', {}, [sel(Object.entries(RAMPS).map(([k, r]) => [k, r.name]), st.ramp, (v) => { st.ramp = v; prev.style.background = rampCSS(v); restyle('ramp'); }), prev])),
      row('Stretch', sel([['p2', 'Cumulative cut 2–98 % (QGIS default)'], ['minmax', 'Min / max'], ['custom', 'Custom range']], st.stretch, (v) => { st.stretch = v; custom.classList.toggle('hidden', v !== 'custom'); restyle('stretch'); })),
      custom,
      row('Opacity', rng(0, 1, 0.05, st.reliefOpacity, set('reliefOpacity'), pct)),
      chk('Hide the sea (elevation ≤ 0 m)', st.hideSea, set('hideSea'))]);
    const hill = sec('Hillshade', [
      row('Sun azimuth', rng(0, 360, 5, st.az, set('az'), (v) => v + '°')),
      row('Sun altitude', rng(5, 85, 1, st.alt, set('alt'), (v) => v + '°')),
      row('Vertical ×', rng(1, 5, 0.5, st.zf, set('zf'), (v) => '×' + v)),
      chk('Multidirectional (average of 4 light directions)', st.multi, set('multi')),
      row('Blending', sel([['multiply', 'Multiply (shade the map below)'], ['normal', 'Normal']], st.hillBlend, set('hillBlend'))),
      row('Opacity', rng(0, 1, 0.05, st.hillOpacity, set('hillOpacity'), pct))]);
    const cont = sec('Contour lines and contour polygons', [
      row('Interval', sel([['auto', 'Automatic (≈ 25 levels)'], ...[1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].map((v) => [v, v + ' m'])], st.interval, (v) => { st.interval = v === 'auto' ? v : +v; restyle('interval'); })),
      row('Index contour', sel([[0, 'None'], [2, 'Every 2nd'], [4, 'Every 4th'], [5, 'Every 5th'], [10, 'Every 10th']], st.indexEvery, (v) => { st.indexEvery = +v; restyle('indexEvery'); })),
      chk('Label index contours', st.labels, set('labels')),
      row('Line colour', sel([['#5d4037', 'Brown'], ['#212121', 'Black'], ['#ffffff', 'White'], ['#1565c0', 'Blue']], st.lineColor, set('lineColor'))),
      row('Line opacity', rng(0.1, 1, 0.05, st.lineOpacity, set('lineOpacity'), pct)),
      row('Polygon opacity', rng(0.05, 1, 0.05, st.bandOpacity, set('bandOpacity'), pct)),
      el('div', { class: 'hint', text: 'Contour polygons use the heat-map colour ramp, one colour per band.' })]);
    const sa = sec('Slope and aspect', [row('Slope opacity', rng(0, 1, 0.05, st.slopeOpacity, set('slopeOpacity'), pct)), row('Aspect opacity', rng(0, 1, 0.05, st.aspectOpacity, set('aspectOpacity'), pct))]);
    return [relief, hill, cont, sa];
  }
  function layerChecks() {
    const wrap = el('div', { class: 'dem-layers' });
    [['dem-relief', 'Elevation heat map'], ['dem-hill', 'Hillshade'], ['dem-contours', 'Contour lines'], ['dem-bands', 'Contour polygons'], ['dem-slope', 'Slope'], ['dem-aspect', 'Aspect']].forEach(([id, label]) => {
      const c = el('input', { type: 'checkbox', 'data-layer': id }); c.checked = A.LAYERS[id].visible;
      c.addEventListener('change', () => { A.LAYERS['g-terrain'].visible = true; A.setVisible(id, c.checked); });
      wrap.appendChild(el('label', { class: 'chk' }, [c, el('span', { text: label })]));
    });
    return wrap;
  }
  function syncDialogLayers() {
    if (!T.dlg) return;
    T.dlg.box.querySelectorAll('input[data-layer]').forEach((c) => (c.checked = A.LAYERS[c.dataset.layer].visible));
  }
  function statusHTML() {
    if (T.loading) return '<span class="spinner"></span> Loading…';
    const g = T.dem;
    if (!g) return 'No DEM loaded yet. Choose a source and an area, then press <b>Load DEM</b>.';
    const s = SRC[g.source], res = g.rowM[g.H >> 1];
    const area = g.landKm2 < g.areaKm2 * 0.999 ? `${U.fmtNum(g.areaKm2, 1)} km², land ${U.fmtNum(g.landKm2, 1)} km²` : `${U.fmtNum(g.areaKm2, 1)} km²`;
    return `<b>${U.esc(s.short)}</b> · ${U.esc(g.areaLabel)}<br>${g.W} × ${g.H} cells, ≈ ${res.toFixed(0)} m · ${area}<br>` +
      `Elevation ${U.fmtNum(g.min)}–${U.fmtNum(g.max)} m (mean ${U.fmtNum(g.mean)} m)<br><span class="muted">${U.esc(s.attr)}</span>`;
  }
  function renderDialogStatus() { if (T.dlg) T.dlg.status.innerHTML = statusHTML(); }
  T.dialog = function () {
    const w = UI.getWindow('terrain');
    if (w) { w.focus(); return w; }
    return UI.window({ id: 'terrain', title: 'Terrain — DEM, Heat Map & Contours', icon: 'terrain', width: 470, height: Math.min(760, window.innerHeight - 60),
      x: Math.max(10, window.innerWidth - 500), y: 64, onClose: () => { T.dlg = null; },
      content: (body, api) => {
        const { sel, row, sec } = ctl();
        const box = el('div', { class: 'pad dem-dlg' });
        const info = el('div', { class: 'hint', text: SRC[st.source].info });
        const status = el('div', { class: 'dem-status', html: '' });
        const loadBtn = el('button', { class: 'btn primary', html: UI.icon('terrain', 'width="14" height="14"') + ' Load DEM', onclick: () => T.load({}) });
        box.append(
          el('div', { class: 'hint', html: 'Download a real elevation model and draw it like QGIS: <b>heat map</b> (colour relief), hillshade, slope, aspect, <b>contour lines</b> and <b>contour polygons</b>. Heights are metres above the geoid (≈ sea level).' }),
          sec('1 · Elevation data', [
            row('Source', sel(Object.entries(SRC).map(([k, s]) => [k, s.name]), st.source, (v) => { st.source = v; save(); info.textContent = SRC[v].info; })), info,
            row('Area', sel(AREAS, st.area, (v) => { st.area = v; save(); })),
            row('Detail', sel([['coarse', 'Coarse (≤ 600 cells, fastest)'], ['normal', 'Normal (≤ 1000 cells)'], ['fine', 'Fine (≤ 1400 cells)']], st.detail, (v) => { st.detail = v; save(); })),
            el('div', { class: 'dem-btns' }, [loadBtn, el('button', { class: 'btn', text: 'Clear', onclick: () => T.clear() })]),
            status]),
          sec('2 · Layers', [layerChecks()]),
          ...styleSections(),
          sec('Tools', [el('div', { class: 'dem-btns' }, [
            el('button', { class: 'btn', html: UI.icon('profile', 'width="14" height="14"') + ' Elevation profile', onclick: () => A.setTool('profile') }),
            el('button', { class: 'btn', text: 'Profile: ground station → launch site', onclick: () => T.profileBetween(S.cfg.gs, S.cfg.site, 'Ground station → CanSat launch site') }),
            el('button', { class: 'btn', text: 'Statistics & hypsometry', onclick: () => T.statsWindow() }),
            el('button', { class: 'btn', text: 'Export…', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); UI.contextMenu(r.left, r.bottom, exportItems()); } })])])
        );
        body.append(box, el('div', { class: 'win-foot' }, [el('span', { class: 'muted', style: { fontSize: '11px' }, text: 'Data: Microsoft Planetary Computer / AWS Open Data, no API key.' }), el('span', { class: 'spacer' }), el('button', { class: 'btn', text: 'Close', onclick: () => api.close() })]));
        T.dlg = { api, box, status };
        renderDialogStatus();
      } });
  };
  /* Layer Styling dock when a terrain layer is selected */
  T.stylingPanel = function (body) {
    const pad = el('div', { class: 'pad' });
    pad.appendChild(el('div', { style: { fontWeight: 600, margin: '2px 0 6px' }, text: `Selected layer: ${A.LAYERS[A.selectedLayer()].name}` }));
    pad.appendChild(el('div', { class: 'dem-status', html: statusHTML() }));
    pad.appendChild(el('div', { class: 'dem-btns', style: { margin: '6px 0 8px' } }, [el('button', { class: 'btn small', text: 'Terrain settings…', onclick: () => T.dialog() }), el('button', { class: 'btn small', text: 'Load DEM for view', onclick: () => T.load({ area: 'view' }) })]));
    styleSections().forEach((s) => pad.appendChild(s));
    body.appendChild(pad);
  };
  function exportItems() {
    const no = () => !T.dem;
    return [{ label: 'DEM → ESRI ASCII grid (.asc + .prj, EPSG:3857)', action: () => T.exportASC(), disabled: no },
      { label: 'Contour lines → GeoJSON', action: () => T.exportContours('lines'), disabled: no },
      { label: 'Contour polygons → GeoJSON (ELEV_MIN / ELEV_MAX)', action: () => T.exportContours('bands'), disabled: no },
      { label: 'Heat map → PNG + world file', action: () => T.exportImage('dem-relief'), disabled: no },
      { label: 'Hillshade → PNG + world file', action: () => T.exportImage('dem-hill'), disabled: no }];
  }
  T.exportItems = exportItems;

  /* ============================== statistics ============================== */
  function needDem() { UI.message('Terrain', 'Load a DEM first (Raster ▸ Terrain or the Terrain button).', 'warn', 5000, { label: 'Open Terrain', run: () => T.dialog() }); }
  T.statsWindow = function () {
    const g = T.dem;
    if (!g) return needDem();
    const old = UI.getWindow('demstats'); if (old) old.close();
    UI.window({ id: 'demstats', title: 'Raster Layer Statistics — DEM', icon: 'table', width: 680, height: Math.min(660, window.innerHeight - 40), content: (body) => {
      const th = levels(g), lo0 = st.hideSea ? 0 : -Infinity;
      const bands = th.lv.map((v) => ({ v, a: 0 })), below = { a: 0 };
      let tot = 0;
      for (let j = 0; j < g.H; j++) {
        const a = g.rowM[j] * g.rowM[j] / 1e6;
        for (let i = 0; i < g.W; i++) {
          const v = g.data[j * g.W + i];
          if (v !== v || v <= lo0) continue;
          tot += a;
          const k = Math.floor((v - th.lv[0]) / th.iv);
          if (k < 0) below.a += a; else bands[Math.min(bands.length - 1, k)].a += a;
        }
      }
      let cum = 0;
      const rows = (below.a > 0 ? [{ label: `< ${U.fmtNum(th.lv[0])} m`, a: below.a, mid: th.lv[0] - th.iv / 2 }] : [])
        .concat(bands.map((b) => ({ label: `${U.fmtNum(b.v)}–${U.fmtNum(b.v + th.iv)} m`, a: b.a, mid: b.v + th.iv / 2 })));
      const s = SRC[g.source], res = g.rowM[g.H >> 1];
      const doc = el('div', { class: 'doc', style: { overflow: 'auto', flex: 1 } });
      doc.innerHTML = `<h2>Layer</h2><table>
        <tr><th>Source</th><td>${U.esc(s.name)}</td></tr><tr><th>Area</th><td>${U.esc(g.areaLabel)}</td></tr>
        <tr><th>Extent</th><td>${U.fmtLL(g.bounds.s, g.bounds.w)} to ${U.fmtLL(g.bounds.n, g.bounds.e)}</td></tr>
        <tr><th>Grid</th><td>${g.W} × ${g.H} cells; ≈ ${res.toFixed(1)} m on the ground (${g.cell.toFixed(2)} m in EPSG:3857)</td></tr>
        <tr><th>Valid cells</th><td>${U.fmtNum(g.valid)} (${U.fmtNum(g.areaKm2, 1)} km², of which land above 0 m ${U.fmtNum(g.landKm2, 1)} km²)</td></tr></table>
        <h2>Band 1 statistics (m)</h2><table><tr><th>Minimum</th><td>${g.min.toFixed(1)}</td><th>Maximum</th><td>${g.max.toFixed(1)}</td></tr>
        <tr><th>Mean</th><td>${g.mean.toFixed(1)}</td><th>Std. deviation</th><td>${g.std.toFixed(1)}</td></tr>
        <tr><th>Median</th><td>${g.median.toFixed(1)}</td><th>2 % / 98 %</th><td>${g.p2.toFixed(1)} / ${g.p98.toFixed(1)}</td></tr></table>
        <h2>Hypsometry (${th.iv} m bands${st.hideSea ? ', land only' : ''})</h2>`;
      const cv = el('canvas');
      doc.appendChild(el('div', { style: { position: 'relative', height: '220px' } }, [cv]));
      const t = el('table');
      t.innerHTML = '<tr><th>Elevation band</th><th>Area (km²)</th><th>% of area</th><th>Cumulative %</th></tr>' +
        rows.map((r) => { cum += r.a; return `<tr><td>${r.label}</td><td>${r.a.toFixed(2)}</td><td>${(100 * r.a / tot).toFixed(1)}</td><td>${(100 * cum / tot).toFixed(1)}</td></tr>`; }).join('');
      doc.appendChild(t);
      body.appendChild(doc);
      const css = getComputedStyle(document.documentElement), txt = css.getPropertyValue('--text').trim() || '#222', grid = css.getPropertyValue('--border-soft').trim() || '#ddd';
      const [lo, hi] = stretch(g);
      new Chart(cv, { type: 'bar', data: { labels: rows.map((r) => r.label), datasets: [{ label: 'Area (km²)', data: rows.map((r) => +r.a.toFixed(3)),
        backgroundColor: rows.map((r) => rampColor(st.ramp, (r.mid - lo) / Math.max(1e-6, hi - lo))) }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: txt, maxRotation: 60, autoSkip: true }, grid: { display: false } }, y: { title: { display: true, text: 'Area (km²)', color: txt }, ticks: { color: txt }, grid: { color: grid } } } } });
    } });
  };

  /* ============================== exports ============================== */
  async function zipLib() {
    if (window.JSZip) return;
    try { await loadScript('vendor/jszip.min.js'); } catch (e) { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'); }
  }
  const PRJ_3857 = 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]';
  const mercX = (g, x) => x * g.cell - Math.PI * 6378137, mercY = (g, y) => Math.PI * 6378137 - y * g.cell;
  const baseName = () => `aeris_${T.dem.source}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  async function saveZip(name, files) {
    await zipLib();
    const zip = new JSZip();
    Object.entries(files).forEach(([n, d]) => zip.file(n, d));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    U.downloadURL(name, url);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  T.exportASC = async function () {
    const g = T.dem;
    if (!g) return needDem();
    A.busy('Writing ASCII grid…'); await U.sleep0();
    try {
      const lines = [`ncols ${g.W}`, `nrows ${g.H}`, `xllcorner ${mercX(g, g.x0).toFixed(3)}`, `yllcorner ${mercY(g, g.y0 + g.H).toFixed(3)}`, `cellsize ${g.cell.toFixed(6)}`, 'NODATA_value -9999'];
      for (let j = 0; j < g.H; j++) {
        const r = new Array(g.W);
        for (let i = 0; i < g.W; i++) { const v = g.data[j * g.W + i]; r[i] = v === v ? v.toFixed(1) : '-9999'; }
        lines.push(r.join(' '));
      }
      const n = baseName();
      await saveZip(n + '_dem.zip', { [n + '.asc']: lines.join('\n'), [n + '.prj']: PRJ_3857,
        'README.txt': `${SRC[g.source].name}\n${SRC[g.source].attr}\nArea: ${g.areaLabel}\nCRS: EPSG:3857 (WGS 84 / Pseudo-Mercator). Heights in metres above the geoid; -9999 = no data.\nResampled by AERIS-GIS to ${g.W} x ${g.H} cells (${g.cell.toFixed(2)} m in EPSG:3857, about ${g.rowM[g.H >> 1].toFixed(1)} m on the ground).\nOpen in QGIS: Layer > Add Layer > Add Raster Layer.` });
      UI.log('Exported DEM ASCII grid ' + n, 'ok', 'Terrain');
    } finally { A.busy(null); }
  };
  T.exportContours = async function (kind) {
    const g = T.dem;
    if (!g) return needDem();
    A.busy('Tracing contours…'); await U.sleep0();
    try {
      const c = trace(g);
      const fc = kind === 'lines' ? lineFeatures(c, false) : bandFeatures(c, true);
      delete fc.labels;
      fc.features.forEach((f) => delete f.properties._c);
      fc.name = kind === 'lines' ? 'contour_lines' : 'contour_polygons';
      fc.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } };
      U.download(`${baseName()}_contour_${kind === 'lines' ? 'lines' : 'polygons'}_${c.th.iv}m.geojson`, JSON.stringify(fc), 'application/geo+json');
    } finally { A.busy(null); }
  };
  T.exportImage = async function (id) {
    const g = T.dem;
    if (!g) return needDem();
    A.busy('Rendering image…'); await U.sleep0();
    try {
      const fn = { 'dem-relief': rgbaRelief, 'dem-hill': rgbaHill, 'dem-slope': rgbaSlope, 'dem-aspect': rgbaAspect }[id];
      const { cv, url } = await toBlobURL(fn(g), g.W, g.H);
      URL.revokeObjectURL(url);
      const png = await new Promise((r) => cv.toBlob(r, 'image/png'));
      const n = `${baseName()}_${id.slice(4)}`;
      const pgw = [g.cell, 0, 0, -g.cell, mercX(g, g.x0 + 0.5), mercY(g, g.y0 + 0.5)].map((v) => v.toFixed(6)).join('\n');
      await saveZip(n + '.zip', { [n + '.png']: png, [n + '.pgw']: pgw, [n + '.prj']: PRJ_3857 });
    } finally { A.busy(null); }
  };

  /* ============================== elevation profile + LoRa line of sight ============================== */
  const PR = { active: false, done: false, pts: [] };
  const PCOL = '#6a1b9a';
  function onDbl() { T.profileFinish(); }
  T.profileStart = function () {
    T.profileClear();
    Object.assign(PR, { active: true, done: false, pts: [] });
    PR.line = L.polyline([], { color: PCOL, weight: 2.5, pane: 'measure' }).addTo(S.map);
    PR.ghost = L.polyline([], { color: PCOL, weight: 1.2, dashArray: '4 4', pane: 'measure' }).addTo(S.map);
    PR.marks = L.layerGroup().addTo(S.map);
    S.map.doubleClickZoom.disable();
    S.map.on('dblclick', onDbl);
  };
  T.profileClick = function (ll) {
    if (!PR.active || PR.done) T.profileStart();
    PR.pts.push(ll);
    PR.line.setLatLngs(PR.pts);
    PR.marks.addLayer(L.circleMarker(ll, { radius: 3.5, color: PCOL, fillOpacity: 1, pane: 'measure' }));
  };
  T.profileMove = function (ll) { if (PR.active && !PR.done && PR.pts.length) PR.ghost.setLatLngs([PR.pts[PR.pts.length - 1], ll]); };
  T.profileFinish = function () {
    if (!PR.active || PR.done) return false;
    PR.pts = PR.pts.filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 0.5);
    PR.done = true;
    PR.ghost.setLatLngs([]);
    S.map.off('dblclick', onDbl);
    setTimeout(() => S.map.doubleClickZoom.enable(), 350);
    if (PR.pts.length < 2) { UI.message('Elevation profile', 'Click at least two points, then double-click or right-click to finish.', 'warn', 5000); return true; }
    PR.line.setLatLngs(PR.pts);
    computeProfile(PR.pts, PR.title || 'Drawn line');
    PR.title = null;
    return true;
  };
  T.profileClear = function () {
    ['line', 'ghost', 'marks', 'hover'].forEach((k) => { if (PR[k]) { PR[k].remove(); PR[k] = null; } });
    if (S.map) { S.map.off('dblclick', onDbl); S.map.doubleClickZoom.enable(); }
    Object.assign(PR, { active: false, done: false, pts: [] });
  };
  T.profileCancel = function () { T.profileClear(); const w = UI.getWindow('profile'); if (w) w.close(); };
  T.profileBetween = function (a, b, title) {
    A.setTool('pan');
    T.profileStart();
    PR.title = title;
    T.profileClick(L.latLng(a.lat, a.lon));
    T.profileClick(L.latLng(b.lat, b.lon));
    T.profileFinish();
    S.map.fitBounds(L.latLngBounds([[a.lat, a.lon], [b.lat, b.lon]]), { padding: [80, 80], maxZoom: 17 });
  };
  async function computeProfile(pts, title) {
    const seg = [];
    let Ltot = 0;
    for (let i = 1; i < pts.length; i++) { const d = U.haversine(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng); seg.push(d); Ltot += d; }
    let g = T.dem;
    if (!pts.every((p) => covers(g, p.lat, p.lng))) {
      let n = -90, s = 90, w = 180, e = -180;
      pts.forEach((p) => { n = Math.max(n, p.lat); s = Math.min(s, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); });
      const padLat = Math.max((n - s) * 0.15, 0.004), padLon = Math.max((e - w) * 0.15, 0.004);
      const b = { n: n + padLat, s: s - padLat, w: w - padLon, e: e + padLon };
      const srcId = fitSource(st.source, b);
      A.busy(`Loading ${SRC[srcId].short} along the profile…`);
      try { g = await T.fetchGrid(b, srcId, 'normal', (m) => A.busy(m)); }
      catch (err) { UI.message('Elevation profile', U.esc(err.message), 'err', 0); return; }
      finally { A.busy(null); }
    }
    const cellM = g.rowM[g.H >> 1];
    const n = U.clamp(Math.round(Ltot / Math.max(cellM, 5)), 100, 1500);
    const P = { d: new Float64Array(n + 1), z: new Float64Array(n + 1), lat: new Float64Array(n + 1), lon: new Float64Array(n + 1), L: Ltot, src: g.source, title, cellM };
    for (let k = 0, si = 0, acc = 0; k <= n; k++) {
      const dist = Ltot * k / n;
      while (si < seg.length - 1 && dist > acc + seg[si]) { acc += seg[si]; si++; }
      const t = seg[si] > 0 ? U.clamp((dist - acc) / seg[si], 0, 1) : 0;
      const la = pts[si].lat + (pts[si + 1].lat - pts[si].lat) * t, lo = pts[si].lng + (pts[si + 1].lng - pts[si].lng) * t;
      P.d[k] = dist; P.lat[k] = la; P.lon[k] = lo; P.z[k] = T.elevAt(la, lo, g);
    }
    PR.prof = P;
    profileWindow(P);
  }
  const LORA_HZ = 433e6, K_EARTH = 4 / 3, R_EARTH = 6371000;
  function lineOfSight(P, h1, h2) {
    const n = P.d.length, Lt = P.L, z1 = P.z[0] + h1, z2 = P.z[n - 1] + h2, lam = 299792458 / LORA_HZ;
    const los = new Float64Array(n), fz = new Float64Array(n);
    let minClr = Infinity, at = 0, blocked = false, fres = true;
    for (let i = 0; i < n; i++) {
      const d1 = P.d[i], d2 = Lt - d1;
      los[i] = z1 + (z2 - z1) * (Lt > 0 ? d1 / Lt : 0);
      const terr = P.z[i] + d1 * d2 / (2 * K_EARTH * R_EARTH);           // terrain + Earth bulge (k = 4/3)
      const F1 = Lt > 0 ? Math.sqrt(lam * d1 * d2 / Lt) : 0;
      fz[i] = los[i] - 0.6 * F1;
      if (i === 0 || i === n - 1 || !isFinite(terr)) continue;
      const clr = los[i] - terr;
      if (clr < minClr) { minClr = clr; at = d1; }
      if (clr < 0) blocked = true;
      if (clr < 0.6 * F1) fres = false;
    }
    return { los, fz, minClr, at, blocked, fres, F1mid: Math.sqrt(lam * Lt / 4) };
  }
  function profileWindow(P) {
    const old = UI.getWindow('profile');
    if (old) { PR.keep = true; old.close(); PR.keep = false; }   // replace the window but keep the new line on the map
    let valid = 0, zmin = Infinity, zmax = -Infinity, up = 0, down = 0, maxSl = 0;
    for (let i = 0; i < P.z.length; i++) {
      const z = P.z[i];
      if (!isFinite(z)) continue;
      valid++; zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
      if (i > 0 && isFinite(P.z[i - 1])) { const dz = z - P.z[i - 1]; if (dz > 0) up += dz; else down -= dz; }
    }
    const span = Math.max(1, Math.round(Math.max(P.cellM, 30) / (P.L / (P.d.length - 1))));
    for (let i = span; i < P.z.length; i += 1) if (isFinite(P.z[i]) && isFinite(P.z[i - span])) maxSl = Math.max(maxSl, Math.abs(P.z[i] - P.z[i - span]) / (P.d[i] - P.d[i - span]) * 100);
    const km = P.L >= 2000;
    const fmtD = (m) => (km ? (m / 1000).toFixed(2) + ' km' : m.toFixed(m < 100 ? 1 : 0) + ' m');
    const isGsSite = /Ground station/.test(P.title);
    const W = UI.window({ id: 'profile', title: `Elevation Profile — ${P.title}`, icon: 'profile', width: Math.min(820, window.innerWidth - 40), height: Math.min(560, window.innerHeight - 40),
      onClose: () => { if (W.chart) W.chart.destroy(); if (PR.keep) return; T.profileClear(); if (S.tool === 'profile') A.setTool('pan'); },
      content: (body, api) => {
        const stats = el('div', { class: 'pad prof-stats', html:
          `<span>Length <b>${fmtD(P.L)}</b></span><span>Start <b>${U.fmtNum(P.z[0], 1)} m</b></span><span>End <b>${U.fmtNum(P.z[P.z.length - 1], 1)} m</b></span>` +
          `<span>Min <b>${U.fmtNum(zmin, 1)} m</b></span><span>Max <b>${U.fmtNum(zmax, 1)} m</b></span><span>Total ascent <b>${U.fmtNum(up)} m</b></span><span>Total descent <b>${U.fmtNum(down)} m</b></span>` +
          `<span>Steepest <b>${maxSl.toFixed(0)} %</b></span><span class="muted">${U.esc(SRC[P.src].short)}, ${P.d.length} samples${valid < P.z.length ? `, ${P.z.length - valid} outside the DEM` : ''}</span>` });
        const cv = el('canvas');
        const chartBox = el('div', { class: 'prof-chart' }, [cv]);
        const losOn = el('input', { type: 'checkbox' }); losOn.checked = true;
        const h1 = el('input', { type: 'number', step: 0.5, min: 0, value: 1.5 }), h2 = el('input', { type: 'number', step: 0.5, min: 0, value: isGsSite ? 100 : 1.5 });
        const res = el('div', { class: 'res' });
        const losRow = el('div', { class: 'pad prof-los' }, [
          el('label', { class: 'chk' }, [losOn, el('span', { text: 'LoRa line of sight (433 MHz)' })]),
          el('label', {}, [el('span', { text: 'Antenna at start (m above ground) ' }), h1]),
          el('label', {}, [el('span', { text: 'At end ' }), h2]), res]);
        const foot = el('div', { class: 'win-foot' }, [
          el('button', { class: 'btn', text: 'Export CSV', onclick: () => U.download(`aeris_profile_${new Date().toISOString().slice(0, 10)}.csv`,
            U.toCSV(Array.from(P.d, (d, i) => ({ d: +d.toFixed(2), lat: +P.lat[i].toFixed(6), lon: +P.lon[i].toFixed(6), z: isFinite(P.z[i]) ? +P.z[i].toFixed(2) : '' })),
              [{ key: 'd', label: 'distance_m' }, { key: 'lat', label: 'lat' }, { key: 'lon', label: 'lon' }, { key: 'z', label: 'elevation_m' }]), 'text/csv') }),
          el('button', { class: 'btn', text: 'Save PNG', onclick: () => api.chart && U.downloadURL('aeris_profile.png', api.chart.toBase64Image('image/png', 1)) }),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn', text: 'New profile', onclick: () => { api.close(); A.setTool('profile'); } }),
          el('button', { class: 'btn', text: 'Close', onclick: () => api.close() })]);
        body.append(stats, chartBox, losRow, foot);
        const css = getComputedStyle(document.documentElement), txt = css.getPropertyValue('--text').trim() || '#222', grid = css.getPropertyValue('--border-soft').trim() || '#ddd';
        const xs = Array.from(P.d, (d) => (km ? d / 1000 : d));
        const terrain = xs.map((x, i) => ({ x, y: isFinite(P.z[i]) ? P.z[i] : null }));
        api.chart = new Chart(cv, { type: 'line',
          data: { datasets: [
            { label: 'Terrain', data: terrain, borderColor: '#6d4c41', backgroundColor: 'rgba(141,110,99,0.35)', fill: 'start', pointRadius: 0, borderWidth: 1.6, tension: 0, spanGaps: false },
            { label: 'Line of sight', data: [], borderColor: '#1565c0', borderWidth: 1.4, borderDash: [6, 4], pointRadius: 0, fill: false },
            { label: '60 % first Fresnel zone', data: [], borderColor: 'rgba(21,101,192,0.55)', borderWidth: 1, borderDash: [2, 3], pointRadius: 0, fill: false }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: { legend: { labels: { color: txt, boxWidth: 18 } },
              tooltip: { callbacks: { title: (it) => `Distance ${it[0].parsed.x.toFixed(km ? 2 : 0)} ${km ? 'km' : 'm'}`, label: (it) => `${it.dataset.label}: ${it.parsed.y.toFixed(1)} m` } } },
            scales: { x: { type: 'linear', min: 0, max: xs[xs.length - 1], title: { display: true, text: `Distance (${km ? 'km' : 'm'})`, color: txt }, ticks: { color: txt }, grid: { color: grid } },
              y: { title: { display: true, text: 'Elevation (m)', color: txt }, ticks: { color: txt }, grid: { color: grid } } },
            onHover: (evt, els, chart) => {
              const x = chart.scales.x.getValueForPixel(evt.x);
              if (!isFinite(x)) return;
              const i = U.clamp(Math.round(x / xs[xs.length - 1] * (xs.length - 1)), 0, xs.length - 1);
              if (!PR.hover) PR.hover = L.circleMarker([P.lat[i], P.lon[i]], { radius: 6, color: '#fff', weight: 2, fillColor: PCOL, fillOpacity: 1, pane: 'measure' }).addTo(S.map);
              else PR.hover.setLatLng([P.lat[i], P.lon[i]]);
            } } });
        const upd = () => {
          const ch = api.chart;
          if (!losOn.checked) { ch.data.datasets[1].data = []; ch.data.datasets[2].data = []; res.className = 'res muted'; res.textContent = 'Line-of-sight check off.'; ch.update('none'); return; }
          const o = lineOfSight(P, +h1.value || 0, +h2.value || 0);
          ch.data.datasets[1].data = xs.map((x, i) => ({ x, y: o.los[i] }));
          ch.data.datasets[2].data = xs.map((x, i) => ({ x, y: o.fz[i] }));
          ch.update('none');
          const where = fmtD(o.at);
          if (o.blocked) { res.className = 'res bad'; res.textContent = `Blocked: terrain rises ${U.fmtNum(-o.minClr, 1)} m above the direct path at ${where}. Expect weak or lost packets on this path (obstructed, like the 233 m range-test path).`; }
          else if (!o.fres) { res.className = 'res warn'; res.textContent = `Clear line of sight (closest ${U.fmtNum(o.minClr, 1)} m at ${where}), but terrain enters 60 % of the first Fresnel zone (radius ≈ ${o.F1mid.toFixed(1)} m mid-path), so expect extra loss.`; }
          else { res.className = 'res ok'; res.textContent = `Clear line of sight with 60 % first-Fresnel-zone clearance (closest ${U.fmtNum(o.minClr, 1)} m at ${where}).`; }
        };
        [losOn, h1, h2].forEach((c) => c.addEventListener(c.type === 'checkbox' ? 'change' : 'input', upd));
        upd();
        chartBox.addEventListener('mouseleave', () => { if (PR.hover) { PR.hover.remove(); PR.hover = null; } });
      } });
  }
})();

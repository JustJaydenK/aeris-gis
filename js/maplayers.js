/* AERIS-GIS — map canvas: Leaflet setup, basemaps, canvas overlays, raster warping, contours */
(function () {
  'use strict';
  const U = AERIS.U, D = AERIS.data, DEG = U.DEG;
  const ML = {};

  ML.basemaps = [
    { id: 'osm', name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19,
      attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
    { id: 'topo', name: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', max: 17,
      attr: '© OpenStreetMap contributors, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' },
    { id: 'esri-img', name: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 17,
      attr: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
    { id: 'esri-topo', name: 'Esri World Topo', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', max: 19,
      attr: 'Tiles © Esri — Esri, HERE, Garmin, FAO, NOAA, USGS' },
    { id: 'esri-hill', name: 'Esri World Hillshade', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', max: 16,
      attr: 'Tiles © Esri — Source: Esri, USGS, NGA, NASA, CGIAR' },
    { id: 'esri-gray', name: 'Esri Light Gray Canvas', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', max: 16,
      attr: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors' },
    { id: 'esri-dark', name: 'Esri Dark Gray Canvas', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', max: 16,
      attr: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors' }
  ];

  ML.createMap = function (el) {
    const map = L.map(el, { zoomControl: false, attributionControl: true, preferCanvas: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, minZoom: 4, maxZoom: 18 })
      .setView([7.25, 125.75], 8);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    [['terrainRelief', 330], ['terrainHill', 335], ['raster', 350], ['terrainVec', 360], ['terrainLbl', 365], ['contours', 380], ['grat', 390], ['traj', 420], ['particles', 430], ['wind', 440], ['cansat', 450], ['measure', 470]]
      .forEach(([n, z]) => { map.createPane(n); map.getPane(n).style.zIndex = z; });
    ['terrainRelief', 'terrainHill', 'terrainLbl'].forEach((n) => (map.getPane(n).style.pointerEvents = 'none'));
    map.getPane('raster').style.pointerEvents = 'none';
    map.getPane('particles').style.pointerEvents = 'none';
    map.getPane('wind').style.pointerEvents = 'none';
    map.getPane('grat').style.pointerEvents = 'none';
    return map;
  };

  /* Generic canvas overlay that redraws after every pan/zoom (hidden during zoom animation) */
  ML.CanvasLayer = L.Layer.extend({
    initialize: function (draw, opts) { this._draw = draw; L.setOptions(this, opts); },
    onAdd: function (map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide aeris-canvas');
      map.getPane(this.options.pane || 'overlayPane').appendChild(this._canvas);
      map.on('moveend zoomend resize viewreset', this.redraw, this);
      this.redraw();
    },
    onRemove: function (map) {
      L.DomUtil.remove(this._canvas);
      map.off('moveend zoomend resize viewreset', this.redraw, this);
    },
    redraw: function () {
      if (!this._map) return this;
      const map = this._map, size = map.getSize(), dpr = window.devicePixelRatio || 1;
      const c = this._canvas;
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
      c.width = size.x * dpr; c.height = size.y * dpr;
      c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      if (this.options.opacity !== undefined) c.style.opacity = this.options.opacity;
      this._draw(ctx, map, size);
      return this;
    },
    setOpacity: function (o) { this.options.opacity = o; if (this._canvas) this._canvas.style.opacity = o; }
  });

  /* ---------- colour helpers ---------- */
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  ML.hex2rgb = hex2rgb;
  function classColor(v, classes, rampRGB, continuous) {
    if (!(v >= classes[0])) return null;
    let c = classes.length - 1;
    for (let i = 0; i < classes.length - 1; i++) if (v < classes[i + 1]) { c = i; break; }
    if (!continuous || c === classes.length - 1) return rampRGB[c];
    const t = Math.log(v / classes[c]) / Math.log(classes[c + 1] / classes[c]);
    const a = rampRGB[c], b = rampRGB[c + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  ML.classColor = classColor;

  /* Concentration raster warped to Web-Mercator rows so the image overlay is geometrically exact */
  ML.rasterURL = function (grid, arr, classes, ramp, continuous = true) {
    const { nx, ny, res, lon0, latN } = grid;
    const latS = latN - ny * res;
    const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * DEG / 2));
    const yN = merc(latN), yS = merc(latS);
    const H = Math.min(900, ny * 2), Wd = nx;
    const cv = document.createElement('canvas');
    cv.width = Wd; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(Wd, H);
    const rgb = ramp.map(hex2rgb);
    for (let r = 0; r < H; r++) {
      const y = yN + (yS - yN) * (r + 0.5) / H;
      const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG;
      const fj = U.clamp((latN - lat) / res - 0.5, 0, ny - 1);
      const j0 = Math.floor(fj), j1 = Math.min(ny - 1, j0 + 1), w = fj - j0;
      for (let i = 0; i < Wd; i++) {
        const v = arr[j0 * nx + i] * (1 - w) + arr[j1 * nx + i] * w;
        const col = classColor(v, classes, rgb, continuous);
        const o = (r * Wd + i) * 4;
        if (!col) { img.data[o + 3] = 0; continue; }
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { url: cv.toDataURL('image/png'), bounds: [[latS, lon0], [latN, lon0 + nx * res]] };
  };

  /* Filled iso-concentration polygons (HYSPLIT-style contours) as GeoJSON */
  ML.contours = function (grid, arr, classes) {
    const { nx, ny, res, lon0, latN } = grid;
    const polys = d3.contours().size([nx, ny]).thresholds(classes).smooth(true)(Array.from(arr));
    const features = polys.filter((p) => p.coordinates.length).map((p, k) => ({
      type: 'Feature',
      properties: { level: p.value, cls: classes.indexOf(p.value) },
      geometry: {
        type: 'MultiPolygon',
        coordinates: p.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [+(lon0 + x * res).toFixed(5), +(latN - y * res).toFixed(5)])))
      }
    }));
    return { type: 'FeatureCollection', features };
  };

  /* ---------- point symbols ---------- */
  ML.volcanoIcon = function (v, highlight) {
    const pri = v.priority;
    const s = pri ? 22 : 15;
    const fill = pri ? '#d7301f' : v.status === 'Active' ? '#f16913' : '#a0785a';
    const ring = highlight ? '<circle cx="12" cy="13" r="11" fill="none" stroke="#ffff00" stroke-width="3"/>' : '';
    const svg = `<svg width="${s}" height="${s}" viewBox="0 0 24 24">${ring}<path d="M12 3 L22 20 H2 Z" fill="${fill}" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>` +
      (pri ? '<path d="M9.5 8.5 q2.5 -3 5 0" fill="none" stroke="#fff" stroke-width="1.4"/>' : '') + '</svg>';
    return L.divIcon({ className: 'aeris-sym', html: svg, iconSize: [s, s], iconAnchor: [s / 2, s * 0.8] });
  };
  ML.label = function (text, cls) {
    return L.divIcon({ className: 'aeris-label ' + (cls || ''), html: `<span>${U.esc(text)}</span>`, iconSize: null, iconAnchor: [-8, 8] });
  };
  ML.shapeIcon = function (shape, color, size = 9) {
    const s = size;
    let body;
    if (shape === 'triangle') body = `<path d="M${s / 2} 0.5 L${s - 0.5} ${s - 0.5} H0.5Z" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    else if (shape === 'square') body = `<rect x="0.5" y="0.5" width="${s - 1}" height="${s - 1}" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    else if (shape === 'diamond') body = `<path d="M${s / 2} 0.5 L${s - 0.5} ${s / 2} L${s / 2} ${s - 0.5} L0.5 ${s / 2}Z" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    else body = `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 0.5}" fill="${color}" stroke="#fff" stroke-width="1"/>`;
    return L.divIcon({ className: 'aeris-sym', html: `<svg width="${s}" height="${s}">${body}</svg>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
  };
  ML.pinIcon = function (kind) {
    const defs = {
      launch: ['#1565c0', '<path d="M12 5 l3 7 h-6z" fill="#fff"/><rect x="11" y="12" width="2" height="4" fill="#fff"/>'],
      gs: ['#2e7d32', '<path d="M12 6 v9 M8.5 8.5 a5 5 0 0 1 7 0 M7 6.5 a7.5 7.5 0 0 1 10 0" stroke="#fff" stroke-width="1.5" fill="none"/>'],
      land: ['#6a1b9a', '<circle cx="12" cy="11" r="3" fill="#fff"/>'],
      vent: ['#b8860b', '<path d="M9 16 q-2 -4 1 -6 q-1 3 2 3 q-1 -4 2 -6 q0 4 2 5 q1 3 -1 4z" fill="#fff"/>']
    };
    const [col, inner] = defs[kind];
    const svg = `<svg width="24" height="30" viewBox="0 0 24 30"><path d="M12 29 C12 29 3 17 3 11 a9 9 0 0 1 18 0 c0 6 -9 18 -9 18z" fill="${col}" stroke="#fff" stroke-width="1.5"/>${inner}</svg>`;
    return L.divIcon({ className: 'aeris-sym', html: svg, iconSize: [24, 30], iconAnchor: [12, 29] });
  };

  /* ---------- decorations ---------- */
  ML.scaleDenominator = function (map) {
    const c = map.getCenter(), z = map.getZoom();
    const mpp = 156543.03392 * Math.cos(c.lat * DEG) / Math.pow(2, z);
    return mpp * 96 / 0.0254;
  };
  ML.zoomForScale = function (map, denom) {
    const c = map.getCenter();
    const mpp = denom * 0.0254 / 96;
    return Math.log2(156543.03392 * Math.cos(c.lat * DEG) / mpp);
  };

  /* graticule with degree labels (QGIS "Grid" decoration) */
  ML.graticule = function () {
    return new ML.CanvasLayer(function (ctx, map, size) {
      const b = map.getBounds();
      const span = b.getEast() - b.getWest();
      const steps = [10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];
      const st = steps.find((s) => span / s >= 4) || 0.01;
      const dec = st >= 1 ? 0 : st >= 0.1 ? 1 : 2;
      ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 3]);
      ctx.font = '10px Segoe UI, sans-serif'; ctx.fillStyle = '#222';
      const halo = (t, x, y) => { ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(t, x, y); ctx.fillText(t, x, y); ctx.restore(); };
      for (let lon = Math.ceil(b.getWest() / st) * st; lon <= b.getEast(); lon += st) {
        const x = map.latLngToContainerPoint([b.getCenter().lat, lon]).x;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.y); ctx.stroke();
        halo(U.fmtLon(lon, dec), x + 3, size.y - 6);
      }
      for (let lat = Math.ceil(b.getSouth() / st) * st; lat <= b.getNorth(); lat += st) {
        const y = map.latLngToContainerPoint([lat, b.getCenter().lng]).y;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.x, y); ctx.stroke();
        halo(U.fmtLat(lat, dec), 4, y - 3);
      }
      ctx.setLineDash([]);
    }, { pane: 'grat' });
  };

  AERIS.maplayers = ML;
})();

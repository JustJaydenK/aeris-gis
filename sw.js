/* AERIS-GIS service worker: lets the installed app (Android home screen) open without a connection.
   App files are network-first, so an online start always gets the newest version and the cache is only
   the offline fallback. Weather, elevation and map-tile requests (other hosts) are not touched. */
const CACHE = 'aeris-gis-v2.3.1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/devtools.js', 'js/data.js', 'js/met.js', 'js/model.js', 'js/cansat.js', 'js/maplayers.js', 'js/ui.js', 'js/app.js',
  'js/terrain.js', 'js/tutorial.js', 'js/mobile.js', 'js/scene3d.js', 'js/figures.js', 'js/panels.js',
  'vendor/leaflet.min.css', 'vendor/leaflet.min.js', 'vendor/d3.min.js', 'vendor/chart.umd.min.js',
  'vendor/three.min.js', 'vendor/OrbitControls.js', 'vendor/jszip.min.js', 'vendor/geotiff.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/logo-128.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

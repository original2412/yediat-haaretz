// קבצי האפליקציה: רשת קודם (לקבל עדכונים), מטמון כגיבוי. אריחי מפה: מטמון קודם.
const APP = 'yh-app-v4', TILES = 'yh-tiles';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icon.svg',
  'vendor/leaflet.css', 'vendor/leaflet.js', 'vendor/turf.min.js',
  'data/layers.js', 'data/places.js', 'data/streams.js', 'data/hatmarim.js', 'data/zones.js', 'data/regions.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (/\/tiles\/|basemaps\.cartocdn|arcgisonline/.test(req.url)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req.url, res.clone());
      return res;
    }));
    return;
  }
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});

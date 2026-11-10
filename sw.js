/* Offline support. Network first, so an online visit always gets the newest version;
   when the network is missing or too slow, the last copy saved on this device is used. */
const CACHE = 'whiteboard-v1';
const CORE = [
  './', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  // Present only in the multi-file (development) layout; missing files are skipped.
  'styles.css', 'js/geometry.js', 'js/io.js', 'js/fill.js', 'js/picker.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./') : undefined);
    const fresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (!saved) return fresh;
    // Give the network a moment; fall back to the saved copy if it is down or slow.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), 2500));
    return Promise.race([fresh.catch(() => saved), timeout]);
  })());
});

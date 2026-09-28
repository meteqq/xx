// Uygulama kabuğunu önbelleğe alır; API istekleri her zaman sunucudan gelir.
const CACHE = 'cari-takip-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Önce ağ, çevrimdışıysa önbellek
  ev.respondWith(
    fetch(ev.request)
      .then((res) => {
        const kopya = res.clone();
        caches.open(CACHE).then((c) => c.put(ev.request, kopya));
        return res;
      })
      .catch(() => caches.match(ev.request).then((r) => r || caches.match('/index.html'))),
  );
});

const CACHE_NAME = 'gmetrics-v3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './logo.svg',
  './logo-icon.svg',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first para que los datos (Firestore) siempre sean frescos; cache como
// respaldo solo para el shell de la app cuando no hay conexión.
// IMPORTANTE: {cache:'no-store'} en el fetch de acá abajo — sin esto, el
// propio caché HTTP del navegador podía devolverle a este fetch() una copia
// vieja de app.js/index.html SIN pasar por la red, aunque el archivo hubiera
// cambiado en el servidor. Eso hacía que correcciones ya subidas parecieran
// "no aplicarse" — no era que el dato se revirtiera, era que el celular
// seguía corriendo código de días atrás. Con no-store, este fetch siempre
// pega a la red de verdad.
//
// CRÍTICO: solo interceptamos pedidos al PROPIO origen (el shell de la app:
// index.html, app.js, styles.css, íconos). Todo lo demás —Firestore,
// Firebase Auth, la fuente de Google, el CDN de Chart.js— pasa de largo SIN
// tocar, dejando que el navegador lo maneje directo. Antes esto interceptaba
// TODO pedido de la página, Firestore incluido — un service worker
// reconstruyendo esos pedidos (aunque sea solo agregando {cache:'no-store'})
// puede romper la conexión en vivo de Firestore de forma intermitente, lo
// que explicaría wellness que "no sube" sin ningún error visible. Ahora
// Firestore queda completamente afuera de este service worker.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, {cache:'no-store'})
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Web Push (notificaciones reales, aunque la app esté cerrada) ──────
// El evento 'push' llega acá en segundo plano cuando /api/send-push manda
// algo a la suscripción de este navegador — ver activarNotificacionesPush()
// en app.js para cómo se genera esa suscripción.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'G-Metrics';
  const options = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './' },
    tag: 'push-' + Date.now(),
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

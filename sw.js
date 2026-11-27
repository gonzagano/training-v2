const CACHE_NAME = 'gmetrics-20261127-8fc8050';
// app.js y styles.css NO van acá: se guardan solos la primera vez que se piden, con su
// ?v= de la versión (bajarlos también sin ?v= era 1,1 MB de más que nunca se usaba).
const APP_SHELL = [
  './',
  './index.html',
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
//
// VELOCIDAD (2026-11-21): antes TODO iba primero a internet, así que cada vez que se
// abría la app se volvían a bajar app.js (1,1 MB) y styles.css aunque no hubieran
// cambiado — en el celular eran varios segundos por apertura. Ahora:
//  - archivos con ?v= (app.js, styles.css): el nombre cambia con cada publicación
//    (release.js), así que si ya está guardado ES la versión correcta → se usa directo.
//  - la página (index.html): primero internet (para enterarse de una versión nueva),
//    pero si tarda más de 3 s se usa la guardada; la nueva queda para la próxima vez.
//  - /api/: nunca se guarda (son respuestas del servidor).
//  - el resto (íconos, logo): lo guardado al toque y se actualiza por atrás.
const put = (req, res) => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(req, c)).catch(() => {}); } return res; };
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.searchParams.has('v')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req, {cache:'no-store'}).then((res) => put(req, res))));
    return;
  }
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    const net = fetch(req, {cache:'no-store'}).then((res) => put(req, res));
    event.respondWith(Promise.race([
      net,
      new Promise((r) => setTimeout(r, 3000)).then(() => caches.match(req)).then((hit) => hit || net),
    ]).catch(() => caches.match(req)));
    return;
  }
  const net = fetch(req, {cache:'no-store'}).then((res) => put(req, res));
  net.catch(() => {}); // sin conexión y con copia guardada: no es un error
  event.respondWith(caches.match(req).then((hit) => hit || net).catch(() => net));
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

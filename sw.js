const CACHE_NAME = 'gmetrics-v1';
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
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── PUSH (Firebase Cloud Messaging) ──────────────────────────
// Recibe el push cuando la app está cerrada/en background y muestra la
// notificación del sistema (igual que cualquier app nativa).
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: "AIzaSyA_GNkUG63pSMNU1aNvAXM-61jVHbwuGQ0",
  authDomain: "training-app-pf.firebaseapp.com",
  projectId: "training-app-pf",
  storageBucket: "training-app-pf.firebasestorage.app",
  messagingSenderId: "698623644418",
  appId: "1:698623644418:web:a5b3fa6093752a53c9e81b"
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'G-Metrics', {
    body: n.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png'
  });
});

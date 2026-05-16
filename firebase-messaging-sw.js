/* Firebase Cloud Messaging Service Worker - VivirStar/ZOMA
 * IMPORTANTE: Este archivo debe estar en la MISMA carpeta que ventas.html
 * Para GitHub Pages subcarpeta (ej: usuario.github.io/vivirstar26/)
 * el archivo debe estar en /vivirstar26/firebase-messaging-sw.js
 */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBb4N6JfrQyDntvYLWk-uJ_kLy-oAqbOIY',
  authDomain: 'vivirstar26.firebaseapp.com',
  projectId: 'vivirstar26',
  storageBucket: 'vivirstar26.firebasestorage.app',
  messagingSenderId: '301272114212',
  appId: '1:301272114212:web:1a846a62c935bb6e8524b1',
  measurementId: 'G-NS9QZY5Z73'
};

// Inicializar solo si no está ya inicializado (evita error en recarga del SW)
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

const messaging = firebase.messaging();

// ── Activación inmediata ─────────────────────────────────────────────────
// En GitHub Pages el SW puede quedarse en "waiting" indefinidamente si hay
// una pestaña con la versión anterior abierta. skipWaiting() fuerza la
// activación inmediata para que getToken() no falle con "no active SW".
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Tomar control de todas las pestañas inmediatamente sin esperar recarga
  event.waitUntil(self.clients.claim());
});

// ── Notificaciones en background ─────────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  // Si la plataforma ya muestra la notificación automáticamente, no duplicar
  if (payload.notification && payload.notification.title) {
    const title = payload.notification.title || 'VivirStar/ZOMA';
    const body  = payload.notification.body  || '';
    const data  = payload.data || {};

    // Detectar base path para el ícono (funciona en subcarpeta GitHub Pages)
    const swScope = self.registration.scope; // ej: https://user.github.io/vivirstar26/
    const iconUrl = swScope + 'icon-192.png';

    const options = {
      body,
      icon: iconUrl,
      badge: iconUrl,
      tag: data.type || 'vivirstar-notif',       // agrupa notificaciones del mismo tipo
      renotify: true,                              // vibra aunque ya haya una del mismo tag
      requireInteraction: true,                    // no desaparece sola en desktop
      data: { url: swScope + 'ventas.html', ...data }
    };

    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// ── Click en notificación ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Usar la URL guardada en data, o construirla desde el scope del SW
  const targetUrl = (event.notification.data && event.notification.data.url)
    || self.registration.scope + 'ventas.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta con la app, la enfoca
      for (const client of windowClients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

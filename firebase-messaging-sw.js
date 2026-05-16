/* Firebase Cloud Messaging Service Worker - App VivirStar/ZOMA */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBb4N6JfrQyDntvYLWk-uJ_kLy-oAqbOIY',
  authDomain: 'vivirstar26.firebaseapp.com',
  projectId: 'vivirstar26',
  storageBucket: 'vivirstar26.firebasestorage.app',
  messagingSenderId: '301272114212',
  appId: '1:301272114212:web:1a846a62c935bb6e8524b1',
  measurementId: 'G-NS9QZY5Z73'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'VivirStar/ZOMA';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = '/ventas.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta con la app, la enfoca en vez de abrir nueva
      for (const client of windowClients) {
        if (client.url.includes('ventas.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

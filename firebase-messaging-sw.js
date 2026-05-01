// Firebase Cloud Messaging Service Worker — VivirStar
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBb4N6JfrQyDntvYLWk-uJ_kLy-oAqbOIY',
  authDomain: 'vivirstar26.firebaseapp.com',
  projectId: 'vivirstar26',
  storageBucket: 'vivirstar26.firebasestorage.app',
  messagingSenderId: '301272114212',
  appId: '1:301272114212:web:1a846a62c935bb6e8524b1'
});

const messaging = firebase.messaging();

const LOGO = 'https://cdn.shopify.com/s/files/1/0744/2300/9452/files/vsr.jpg?v=1777677364';

messaging.onBackgroundMessage(function(payload) {
  var title = payload.notification?.title || '🛍️ VivirStar — Nueva venta';
  var options = {
    body: payload.notification?.body || 'Nueva venta registrada',
    icon: LOGO,
    badge: LOGO,
    tag: 'venta-' + Date.now(),
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'ver', title: '👀 Ver venta' },
      { action: 'cerrar', title: 'Cerrar' }
    ],
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action !== 'cerrar') {
    event.waitUntil(clients.openWindow('/VivirStar/panel.html'));
  }
});

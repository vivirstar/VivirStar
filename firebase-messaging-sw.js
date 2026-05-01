// Firebase Cloud Messaging Service Worker — vivirstar26
// Archivo: firebase-messaging-sw.js (subir a la raiz del repo GitHub)

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

// Handle background notifications (app closed or minimized)
messaging.onBackgroundMessage(function(payload) {
  console.log('Notificacion background:', payload);

  var notificationTitle = payload.notification?.title || '🛍️ Nueva venta';
  var notificationOptions = {
    body: payload.notification?.body || 'Nueva venta registrada',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'nueva-venta-' + Date.now(),
    requireInteraction: true,
    actions: [
      { action: 'ver', title: 'Ver venta' }
    ],
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'ver') {
    event.waitUntil(
      clients.openWindow('/panel.html')
    );
  }
});

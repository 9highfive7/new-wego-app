/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js')

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// The web app will initialize messaging in runtime. This file only listens to background messages.
// Firebase config is not strictly needed here when using compat, but we allow init if provided.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_MESSAGING') {
    const cfg = event.data.payload
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg)
    }
    if (firebase.messaging.isSupported()) {
      const messaging = firebase.messaging()
      messaging.onBackgroundMessage((payload) => {
        const notificationTitle = payload.notification?.title || 'Wego'
        const notificationOptions = {
          body: payload.notification?.body,
          icon: '/icons/icon-192.png',
          data: payload.data || {},
        }
        self.registration.showNotification(notificationTitle, notificationOptions)
      })
    }
  }
})


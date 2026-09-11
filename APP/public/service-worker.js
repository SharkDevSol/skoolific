// Kill-switch service worker: deletes ALL caches and unregisters itself.
// Replaces the old offline-first SW that was serving a stale app shell.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
  // Unregister this SW so it never runs again.
  self.registration.unregister();
});

self.addEventListener('fetch', (event) => {
  // Never serve from cache — always go to the network for fresh code.
  return;
});

const CACHE = 'skoolific-v23';
const DATA_CACHE = 'skoolific-v23-guardian-data';

// Guardian read-only API paths that should be cached for offline viewing.
// (marks, payments, report card, attendance, profile, branding, notifications)
const GUARDIAN_READ_PREFIXES = [
  '/api/guardian-list/',
  '/api/guardianPayments',
  '/api/students/guardian-profile',
  '/api/mark-list/guardian-marks',
  '/api/posts/profile/guardian',
  '/api/admin/branding'
];

const isGuardianRead = (pathname) =>
  GUARDIAN_READ_PREFIXES.some((p) => pathname.includes(p) || pathname.startsWith(p));

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete old app-shell caches, but KEEP the guardian-data cache so offline
  // data survives across deploys.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== DATA_CACHE).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let pathname;
  try {
    pathname = new URL(request.url).pathname;
  } catch (e) {
    return;
  }

  // App shell (navigation + static assets): ALWAYS network — never cache, so
  // new deploys load fresh code with no stale-asset bugs. (unchanged philosophy)
  if (request.mode === 'navigate') return;
  if (!pathname.startsWith('/api/')) return;

  // Guardian read-only API: network-first, fall back to cached copy when offline.
  if (isGuardianRead(pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            // Let the app handle a genuine offline error (no fake 503 JSON)
            return new Response('', { status: 503, statusText: 'Offline' });
          })
        )
    );
    return;
  }

  // All other API: pass through untouched (writes/logins/etc.).
});

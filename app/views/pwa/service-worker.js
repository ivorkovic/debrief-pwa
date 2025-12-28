// Service Worker for Debrief PWA
// Based on Fizzy's stable iOS implementation

const CACHE_VERSION = 'v3';
const CACHE_NAME = `debrief-${CACHE_VERSION}`;

// Install event - take control immediately
self.addEventListener('install', (event) => {
  console.log('Service Worker installing, version:', CACHE_VERSION);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - claim all clients immediately
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(
    Promise.all([
      // Take control of all pages immediately
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('debrief-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
    ])
  );
});

// Fetch event - Network-first with cache fallback (Fizzy's pattern)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls and form submissions - let them fail naturally if offline
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/debriefs') && event.request.method === 'POST') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/push/')) return;

  // For document requests (HTML pages) - network-first with cache fallback
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          // Fallback to cache if network fails
          const cached = await caches.match(event.request);
          // If no cache, return a basic offline page to prevent blank screen
          if (!cached) {
            return new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body style="background:#111827;color:white;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>Offline</h1><p>Please check your connection and try again.</p></div></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html' } }
            );
          }
          return cached;
        })
    );
    return;
  }

  // For static assets - stale-while-revalidate
  if (event.request.destination === 'style' ||
      event.request.destination === 'script' ||
      event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            // Clone FIRST before response body can be consumed
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
});

// Push notification handler
self.addEventListener("push", async (event) => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || "New notification",
    icon: data.icon || "/icon.png",
    badge: "/icon.png",
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "Debrief", options),
      // Update badge count if supported
      self.navigator.setAppBadge?.(data.badge || 0)
    ])
  );
});

// Notification click handler - improved to handle frozen app state
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const path = event.notification.data?.path || "/";
  const url = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Try to find and focus an existing window
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Try to find any window and navigate it
      const focused = clientList.find((client) => client.focused);
      if (focused) {
        return focused.navigate(url).then(() => focused.focus());
      }
      // Open new window as last resort
      return clients.openWindow(url);
    })
  );
});

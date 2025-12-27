// Service Worker for Debrief PWA
// Handles push notifications and offline caching

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
    self.registration.showNotification(data.title || "Debrief", options)
  );
});

// Notification click handler
self.addEventListener("notificationclick", function(event) {
  event.notification.close();

  const path = event.notification.data?.path || "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Try to focus existing window
      for (let client of clientList) {
        const clientPath = new URL(client.url).pathname;
        if (clientPath === path && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window if none found
      if (clients.openWindow) {
        return clients.openWindow(path);
      }
    })
  );
});

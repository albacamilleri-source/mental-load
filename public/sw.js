// mental load. — Service Worker
// Handles push notifications for Josh's routine assignments

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || "mental load.", {
      body: data.body || "",
      icon: "/mental-load/logo192.png",
      badge: "/mental-load/logo192.png",
      tag: "mental-load-routine",
      renotify: true,
      data: { url: data.url || "/mental-load/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/mental-load/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes("mental-load") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open it
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

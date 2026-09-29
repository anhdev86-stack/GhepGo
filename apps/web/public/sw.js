/* GhepGo Web Push service worker */
self.addEventListener("push", (event) => {
  let payload = { title: "GhepGo", body: "", data: {} };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: payload.data,
      tag: payload.data?.tripId || payload.data?.notificationId || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const path = data.screen === "wallet" ? "/wallet" : data.screen === "group" || data.screen === "home" ? "/driver" : "/trips";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) {
        existing.navigate(path);
        return existing.focus();
      }
      return self.clients.openWindow(path);
    }),
  );
});

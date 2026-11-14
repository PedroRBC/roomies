self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

function safeNotificationUrl(value) {
  try {
    const url = new URL(
      typeof value === "string" ? value : "/",
      self.location.origin,
    );
    if (
      url.origin === self.location.origin &&
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Invalid payloads open the app home. */
  }
  return new URL("/", self.location.origin).href;
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const data = event.data ? event.data.json() : {};
    if (data && typeof data === "object") payload = data;
  } catch {
    /* A malformed payload still produces a visible notification. */
  }
  const houseId = typeof payload.house_id === "string" ? payload.house_id : "";
  const id =
    typeof payload.notification_id === "string"
      ? payload.notification_id
      : "roomies";
  const language = (self.navigator.language || "en").split("-")[0];
  const body =
    language === "pt"
      ? "Você tem uma notificação do Roomies."
      : language === "es"
        ? "Tienes una notificación de Roomies."
        : "You have a Roomies notification.";
  event.waitUntil(
    self.registration.showNotification("Roomies", {
      body,
      tag: `roomies-${id}`,
      renotify: false,
      data: { url: houseId ? `/house/${encodeURIComponent(houseId)}` : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(
    event.notification.data && event.notification.data.url,
  );
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const existing = windows.find((client) => client.url === url);
        return existing ? existing.focus() : self.clients.openWindow(url);
      }),
  );
});

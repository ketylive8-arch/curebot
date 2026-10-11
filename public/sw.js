// התראות CureBot לטלפון של קטי. לחיצה על התראה פותחת את השיחה בלוח הבקרה.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "CureBot", body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(d.title || "CureBot", {
      body: d.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      dir: "rtl",
      lang: "he",
      tag: d.conversation || undefined,
      renotify: true,
      data: { conversation: d.conversation || "" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conv = (event.notification.data && event.notification.data.conversation) || "";
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.includes("/admin")) {
          c.postMessage({ openConversation: conv });
          return c.focus();
        }
      }
      // המפתח שמור בדפדפן של קטי (localStorage), הדף ישלים אותו בעצמו
      return clients.openWindow("/admin" + (conv ? "?c=" + encodeURIComponent(conv) : ""));
    })(),
  );
});

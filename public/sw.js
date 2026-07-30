// ==========================================================================
// الخدمة اللي بتستقبل الإشعارات وهي شغالة في الخلفية
// --------------------------------------------------------------------------
// الملف ده لازم يبقى في `public/` وفي جذر الموقع بالظبط — المتصفح مش بيسمح
// لخدمة في مجلد جوّه إنها تشتغل على الموقع كله.
//
// ملحوظة: ده مش TypeScript ومش داخل في البناء — بيتقدّم زي ما هو.
// ==========================================================================

self.addEventListener("install", () => {
  // منستناش الصفحات القديمة تتقفل — الخدمة تشتغل فورًا
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "مينيز";
  const options = {
    body: data.body || "",
    // الأيقونة بتظهر جنب الإشعار
    icon: "/icon.png",
    badge: "/icon.png",
    dir: "rtl",
    lang: "ar",
    // نفس التاج بيستبدل الإشعار القديم بدل ما يتراكم
    tag: data.tag || undefined,
    data: { url: data.url || "/orders" },
    // الموبايل يهزّ شوية عشان تحس بيه
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/orders";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        // التطبيق مفتوح خلاص؟ نوديه على الصفحة بدل ما نفتح نسخة تانية
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

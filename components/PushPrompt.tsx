"use client";

import { useEffect, useState } from "react";

/**
 * طلب تشغيل الإشعارات أول ما تفتح البرنامج.
 *
 * ⚠️ **مينفعش نطلب الإذن لوحدنا من غير ما المستخدم يدوس.** المتصفحات
 * (وآبل تحديدًا) بترفض `requestPermission` لو مش جاي من دوسة مستخدم — لو
 * ناديناها وقت التحميل بتفشل من غير ما يبان أي حاجة، والمستخدم يفضل مستني.
 *
 * فاللي بنعمله: الطلب **بيبان لوحده** أول ما تفتح، ودوسة واحدة تخلص. ودي
 * أقصى حاجة المنصة بتسمح بيها.
 */
const HIDE_KEY = "minis-push-prompt-hidden-until";
/** لو أجّلها، مانزنّش تاني غير بعد ٣ أيام */
const SNOOZE_DAYS = 3;

function base64ToUint8Array(base64: string) {
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // أجّلها قريب؟ مانزنّش
        const until = Number(localStorage.getItem(HIDE_KEY) ?? 0);
        if (until > Date.now()) return;

        // المتصفح مابيدعمش، أو المستخدم رفض خلاص — الإعدادات فيها الشرح
        if (
          !("serviceWorker" in navigator) ||
          !("PushManager" in window) ||
          !("Notification" in window)
        ) {
          return;
        }
        if (Notification.permission !== "default") {
          // مسموح خلاص؟ نتأكد إن الجهاز متسجّل عندنا
          if (Notification.permission === "granted") {
            const reg = await navigator.serviceWorker.getRegistration("/sw.js");
            const sub = await reg?.pushManager.getSubscription();
            if (sub) return;
          } else {
            return;
          }
        }

        setShow(true);
      } catch {
        // أي لخبطة = مانعرضش حاجة
      }
    })();
  }, []);

  function snooze() {
    localStorage.setItem(
      HIDE_KEY,
      String(Date.now() + SNOOZE_DAYS * 86_400_000)
    );
    setShow(false);
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/push/subscribe");
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "الإشعارات لسه مش مظبوطة");

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        snooze();
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(j.key),
      });

      const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const saved = await save.json();
      if (!saved.ok) throw new Error(saved.error ?? "معرفناش نحفظ الجهاز");

      setShow(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصل خطأ");
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="mb-4 rounded-xl border border-gray-900 bg-primary p-3 text-white">
      <p className="text-sm font-bold">شغّل إشعارات الموبايل؟</p>
      <p className="mt-1 text-xs leading-6 text-gray-300">
        هتوصلك تنبيهات أول ما عميل مايستلمش، أو شحنة تقف، أو أوردر يفضل مش
        مؤكد — على الموبايل ده من غير ما تفتح البرنامج.
      </p>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-gray-900 disabled:opacity-50"
        >
          {busy ? "لحظة…" : "شغّلها"}
        </button>
        <button
          type="button"
          onClick={snooze}
          className="rounded-lg px-3 py-1.5 text-xs text-gray-300"
        >
          مش دلوقتي
        </button>
      </div>
    </div>
  );
}

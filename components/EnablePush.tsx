"use client";

import { useEffect, useState } from "react";

/**
 * زرار تشغيل إشعارات الموبايل.
 *
 * الإشعار بيروح **للجهاز** مش للحساب، فكل واحد لازم يفعّلها من موبايله هو.
 *
 * **وعلى الآيفون** لازم يفتح البرنامج من الأيقونة اللي على الشاشة الرئيسية
 * (Add to Home Screen) مش من سفاري — آبل مابتسمحش بغير كده، والزرار هنا
 * بيكشف الحالة دي ويقولها بالعربي بدل ما المستخدم يدوس ومايحصلش حاجة.
 */
function base64ToUint8Array(base64: string) {
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State =
  | "checking"
  | "unsupported"
  | "needs_home_screen"
  | "blocked"
  | "off"
  | "on"
  | "working";

export function EnablePush() {
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        // آيفون في سفاري العادي مابيعرضش PushManager خالص
        const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as { standalone?: boolean }).standalone === true;
        setState(iOS && !standalone ? "needs_home_screen" : "unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }

      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const existing = await reg?.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setState("working");
    setNote(null);
    try {
      const res = await fetch("/api/push/subscribe");
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "معرفناش نجيب المفتاح");

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
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

      setState("on");
      setNote("تمام — الإشعارات هتوصل على الموبايل ده.");
    } catch (e) {
      setState("off");
      setNote(e instanceof Error ? e.message : "حصل خطأ");
    }
  }

  async function disable() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE" }
        );
        await sub.unsubscribe();
      }
      setState("off");
      setNote("الإشعارات اتوقفت على الموبايل ده.");
    } catch {
      setState("on");
    }
  }

  const box = "rounded-xl border p-3 text-xs leading-6";

  if (state === "checking") {
    return <p className="text-xs text-gray-400">بنشوف حالة الإشعارات…</p>;
  }

  if (state === "needs_home_screen") {
    return (
      <div className={`${box} border-amber-300 bg-amber-50 text-amber-900`}>
        <b>على الآيفون فيه خطوة واحدة قبل الإشعارات:</b>
        <br />
        من سفاري دوس زرار المشاركة (المربع بسهم لفوق) ← <b>Add to Home
        Screen</b> ← وبعدين افتح البرنامج <b>من الأيقونة اللي على الشاشة</b> مش
        من سفاري، وهتلاقي الزرار هنا.
        <br />
        آبل مابتسمحش بالإشعارات إلا كده.
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className={`${box} border-gray-200 bg-gray-50 text-gray-600`}>
        المتصفح ده مابيدعمش الإشعارات. جرّب كروم على أندرويد أو الكمبيوتر، أو
        على الآيفون ضيف البرنامج للشاشة الرئيسية.
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className={`${box} border-red-300 bg-red-50 text-red-800`}>
        <b>الإشعارات مرفوضة من إعدادات المتصفح.</b>
        <br />
        لازم تسمح بيها من إعدادات الموقع في المتصفح، وبعدين ترجع هنا.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            ✅ الإشعارات شغالة على الموبايل ده
          </span>
          <button
            type="button"
            onClick={disable}
            className="text-[11px] text-gray-500 underline"
          >
            وقّفها على الجهاز ده
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={state === "working"}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "working" ? "لحظة…" : "شغّل الإشعارات على الموبايل ده"}
        </button>
      )}

      {note && <p className="text-[11px] text-gray-500">{note}</p>}

      <p className="text-[11px] leading-5 text-gray-400">
        الإشعار بيروح للجهاز مش للحساب — كل واحد لازم يشغّلها من موبايله هو.
      </p>
    </div>
  );
}

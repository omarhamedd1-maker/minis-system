"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// كارت الأوردر على الموبايل:
//  - ضغطة عادية بتفتح الأوردر
//  - ضغطة طويلة بتشغّل وضع التحديد (مفيش مربعات ظاهرة قبل كده)
//  - وفي وضع التحديد، الضغطة بتحدّد بدل ما تفتح
//  - وسحبة جانبية بتعمل فعل: شمال واتساب · يمين تعليق (ORDERS §٤)
const LONG_PRESS_MS = 450;

/**
 * ==========================================================================
 * السحب الجانبي (ORDERS-PAGE-REDESIGN §٤ · الخطوة ١٠)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **إضافة مش بديل.** الأيقونات التلاتة تحت الكارت بتفضل مكانها —
 * السحب حاجة بتتعلّم بالصدفة، والصفحة اللي فعلها مخبّي في إيماءة بس
 * بتبقى فيها أفعال محدش يعرفها.
 *
 * ⚠️ **الضغط المطوّل محجوز لوضع التحديد** (قرار عمر ١٦ سبتمبر)، فالسحب
 * بيلغي عدّاد الضغطة الطويلة أول ما يتأكد إنه أفقي.
 *
 * ⚠️ **و`touch-action: pan-y`** — من غيرها المتصفح بياخد الإيماءة الأفقية
 * لنفسه (رجوع للخلف في بعض المتصفحات) والسحب مابيوصلش، أو التمرير الرأسي
 * بيقف وانت بتعدّي بإصبعك.
 */
/** بعده السحب بيتحسب فعل مش لخبطة */
const SWIPE_FIRE = 72;
/** أقصى مسافة الكارت بيتزحزحها — الباقي بيتشد */
const SWIPE_MAX = 96;
/** تحت كده الإيماءة لسه مش متحددة أفقي ولا رأسي */
const SWIPE_DECIDE = 10;

export function SelectableOrderCard({
  orderId,
  hasAwb,
  stuck = false,
  children,
}: {
  orderId: string;
  hasAwb: boolean;
  /**
   * شحنة واقفة (`STUCK_DAYS`) — الخلفية بتتغيّر درجة، من غير أيقونة ولا كلام
   * (ORDERS §٢د). ⚠️ الكارت مالوش إطار ولا ظل: `surface` على `canvas`.
   */
  stuck?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const firstRun = useRef(true);
  const [pressed, setPressed] = useState(false);

  // ===== السحب الجانبي =====
  const root = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  /** null = لسه مش متحدد · "h" أفقي (سحب) · "v" رأسي (تمرير الصفحة) */
  const axis = useRef<"h" | "v" | null>(null);
  /** سحبة اتعملت = الدوسة اللي بعدها مافتحش الأوردر */
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);

  // بنبلّغ الشريط بعد ما الـ DOM يتحدّث فعلاً — عشان الشريط يظهر من أول تحديد
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    document.dispatchEvent(new Event("minis-selection-changed"));
  }, [selected]);

  // وضع التحديد مشترك بين كل الكروت — بنسمع لحدث عام
  useEffect(() => {
    const onMode = (e: Event) => {
      const on = (e as CustomEvent<boolean>).detail;
      setSelectMode(on);
      if (!on) setSelected(false);
    };
    document.addEventListener("minis-select-mode", onMode);
    return () => document.removeEventListener("minis-select-mode", onMode);
  }, []);

  function enterSelectMode() {
    document.dispatchEvent(
      new CustomEvent("minis-select-mode", { detail: true })
    );
  }

  // الأزرار والقوايم جوّه الكارت بتشتغل لوحدها — مانفتحش الأوردر ولا نحدّد بسببها
  function isInteractive(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return Boolean(el?.closest?.("button, a, select, input, label, form, textarea"));
  }

  /**
   * بيدوس الفعل اللي جوّه الكارت نفسه بدل ما يعيد كتابته.
   *
   * ⚠️ **مصدر واحد للفعل**: لينك الواتساب فيه الرسالة الجاهزة، وزرار
   * التعليق بيفتح نفس المودال. لو السحب عمل نسخة تانية منهم، أي تعديل
   * على واحد بيسيب التاني وراه.
   */
  function fire(selector: string) {
    root.current?.querySelector<HTMLElement>(selector)?.click();
  }

  function start(e: React.PointerEvent) {
    if (isInteractive(e.target)) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    axis.current = null;
    swiped.current = false;
    setPressed(true);
    longFired.current = false;
    timer.current = setTimeout(() => {
      longFired.current = true;
      if (navigator.vibrate) navigator.vibrate(15);
      enterSelectMode();
      setSelected(true);
    }, LONG_PRESS_MS);
  }

  function move(e: React.PointerEvent) {
    if (startX.current === null) return;
    const moveX = e.clientX - startX.current;
    const moveY = e.clientY - startY.current;

    if (axis.current === null) {
      if (Math.abs(moveX) < SWIPE_DECIDE && Math.abs(moveY) < SWIPE_DECIDE) return;
      // الرأسي بيفوز في التعادل — التمرير أهم من فعل بالصدفة
      axis.current = Math.abs(moveX) > Math.abs(moveY) ? "h" : "v";
      // سحب أفقي؟ يبقى مش ضغطة طويلة ولا دوسة
      if (axis.current === "h") cancelPress();
    }
    if (axis.current !== "h") return;
    // بيتشد كل ما تزيد — عشان تحس إن فيه حد
    const pull = Math.sign(moveX) * Math.min(Math.abs(moveX), SWIPE_MAX);
    setDx(pull);
  }

  function endSwipe() {
    if (axis.current === "h" && Math.abs(dx) >= SWIPE_FIRE) {
      swiped.current = true;
      if (navigator.vibrate) navigator.vibrate(10);
      // شمال = واتساب · يمين = تعليق (ORDERS §٤)
      fire(dx < 0 ? "[data-order-wa]" : "[data-order-comments]");
    }
    startX.current = null;
    axis.current = null;
    setDx(0);
  }

  function cancelPress() {
    setPressed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function cancel() {
    cancelPress();
    endSwipe();
  }

  function onClick(e: React.MouseEvent) {
    // ضغطة على زرار/لينك جوّه الكارت (تعليق، واتساب، طباعة...) — نسيبها تشتغل لوحدها
    if (isInteractive(e.target)) return;
    // سحبة لسه حاصلة = مانفتحش الأوردر فوق الفعل
    if (swiped.current) {
      e.preventDefault();
      swiped.current = false;
      return;
    }
    // لو الضغطة كانت طويلة، مانفتحش
    if (longFired.current) {
      e.preventDefault();
      longFired.current = false;
      return;
    }
    // في وضع التحديد: الضغطة بتحدّد
    if (selectMode) {
      e.preventDefault();
      setSelected((v) => !v);
      return;
    }
    // عادي: نفتح الأوردر
    router.push(`/orders/${orderId}`);
  }

  /** وصلت للحد؟ الكلمة بتغمق — عشان تعرف إنك لو سِبت هيحصل فعل */
  const ready = Math.abs(dx) >= SWIPE_FIRE;

  return (
    <div ref={root} className="relative">
      {/*
        طبقة الفعل — بتبان من تحت الكارت وهو بيتزحزح.
        ⚠️ `left`/`right` مش `start`/`end`: دي جهات الإصبع على الشاشة،
        والصفحة عربي فاللوجيكي كان هيقلبها.
      */}
      {dx !== 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center rounded-card bg-sunken text-xs font-medium"
        >
          {dx > 0 && (
            <span
              className={`absolute left-4 ${ready ? "text-info" : "text-ink-faint"}`}
            >
              تعليق
            </span>
          )}
          {dx < 0 && (
            <span
              className={`absolute right-4 ${ready ? "text-success" : "text-ink-faint"}`}
            >
              واتساب
            </span>
          )}
        </div>
      )}
    <div
      // علامة «آخر أوردر فتحته» بتتحط من هنا (`components/LastOpenedOrder.tsx`)
      data-order-id={orderId}
      onPointerDown={(e) => start(e)}
      onPointerMove={move}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        transform: dx ? `translateX(${dx}px)` : undefined,
        // الرجوع بيتحرك، والسحب نفسه بيمشي مع الإصبع من غير تأخير
        transition: dx ? undefined : "transform 150ms",
      }}
      className={`relative cursor-pointer select-none touch-pan-y rounded-card p-3 transition-colors duration-75 ${
        pressed ? "bg-line" : stuck ? "bg-warning-soft/60" : "bg-surface"
      } ${selected ? "ring-2 ring-primary" : ""}`}
    >
      {/* الشيك بوكس المخفي — الشريط بيقرأ منه المحدد */}
      <input
        type="checkbox"
        data-order-checkbox
        data-has-awb={hasAwb ? "1" : "0"}
        value={orderId}
        checked={selected}
        onChange={() => {}}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* دايرة التحديد على اليمين — والمحتوى بيزحزح شمال عشان يفضّي مكانها */}
      {selectMode && (
        <span
          className={`absolute start-3 top-3.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
            selected
              ? "border-primary bg-primary text-white"
              : "border-line-strong bg-surface"
          }`}
        >
          {selected && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              className="h-3 w-3"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </span>
      )}
      <div
        className={`transition-[padding] ${selectMode ? "ps-7" : ""}`}
      >
        {children}
      </div>
    </div>
    </div>
  );
}

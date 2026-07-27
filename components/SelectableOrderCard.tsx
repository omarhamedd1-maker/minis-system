"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// كارت الأوردر على الموبايل:
//  - ضغطة عادية بتفتح الأوردر
//  - ضغطة طويلة بتشغّل وضع التحديد (مفيش مربعات ظاهرة قبل كده)
//  - وفي وضع التحديد، الضغطة بتحدّد بدل ما تفتح
const LONG_PRESS_MS = 450;

export function SelectableOrderCard({
  orderId,
  hasAwb,
  children,
}: {
  orderId: string;
  hasAwb: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const firstRun = useRef(true);
  const [pressed, setPressed] = useState(false);

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

  function start(e: React.PointerEvent) {
    if (isInteractive(e.target)) return;
    setPressed(true);
    longFired.current = false;
    timer.current = setTimeout(() => {
      longFired.current = true;
      if (navigator.vibrate) navigator.vibrate(15);
      enterSelectMode();
      setSelected(true);
    }, LONG_PRESS_MS);
  }

  function cancel() {
    setPressed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function onClick(e: React.MouseEvent) {
    // ضغطة على زرار/لينك جوّه الكارت (تعليق، واتساب، طباعة...) — نسيبها تشتغل لوحدها
    if (isInteractive(e.target)) return;
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

  return (
    <div
      onPointerDown={(e) => start(e)}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative cursor-pointer select-none rounded-xl p-3 shadow-sm transition-colors duration-75 ${
        pressed ? "bg-gray-200" : "bg-white"
      } ${selected ? "ring-2 ring-gray-900" : ""}`}
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
              ? "border-gray-900 bg-gray-900 text-white"
              : "border-gray-300 bg-white"
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
  );
}

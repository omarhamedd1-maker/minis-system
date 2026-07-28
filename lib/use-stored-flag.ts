"use client";

import { useSyncExternalStore } from "react";

// بيقرا قيمة محفوظة في المتصفح بالطريقة اللي رياكت بيوصّي بيها.
// السيرفر بيرجّع false دايمًا، والمتصفح بيقرا القيمة الحقيقية بعد ما الصفحة تفتح —
// من غير ما نستخدم effect بيغيّر الحالة (اللي بيسبب رسم متكرر).

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // التبويبات التانية لو غيّرت القيمة
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** ينادى بعد أي كتابة عشان اللي بيقرا يتحدّث */
export function notifyStoredFlagChanged() {
  for (const l of listeners) l();
}

export function useStoredFlag(key: string, trueValue = "1"): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === trueValue;
      } catch {
        return false;
      }
    },
    () => false // اللي بيتعرض من السيرفر
  );
}

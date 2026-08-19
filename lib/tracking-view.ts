// ==========================================================================
// صفحة التتبع اللي العميل بيفتحها
// --------------------------------------------------------------------------
// العميل دلوقتي بيروح على موقع بوسطة عشان يعرف شحنته فين — وده اسم شركة
// الشحن مش اسم متجرك. الصفحة دي بتخلّيه يفضل عندك.
//
// ⚠️⚠️ **الصفحة مفتوحة من غير حساب — أي حد معاه رقم التتبع بيفتحها.**
// اللي بيتعرض من غير تحقّق: **الحالة وبس**. التفاصيل (المنتجات · العنوان ·
// المبلغ) ورا بوابة `lib/phone-gate.ts`.
//
// **والكلام إنجليزي** (`lib/tracking-copy.ts`) — دي الصفحة الوحيدة اللي
// العميل بيقراها، وباقي السيستم عربي لأنه بيتكلّم مع صاحب المتجر.
//
// **الملف ده صافي** — بياخد حالة وبيرجّع اللي يتعرض.
// ==========================================================================

import {
  STATUS_COPY,
  FALLBACK_COPY,
  STEP_LABELS,
  type StatusCopy,
} from "./tracking-copy";

export type TrackStep = {
  label: string;
  /** الخطوة دي عدّت؟ */
  done: boolean;
  /** إحنا واقفين عندها دلوقتي؟ */
  current: boolean;
};

export type TrackView = StatusCopy & {
  steps: TrackStep[];
  /** الشحنة خلصت مشوارها (وصلت أو رجعت) */
  finished: boolean;
};

/** خط سير الشحنة الطبيعي */
const JOURNEY = ["confirmed", "ready", "shipped", "out_for_delivery", "delivered"];

/** الحالات اللي وقفت الرحلة — مافيش خطوة «حالية» فيها */
const STOPPED = ["returning", "returned", "returned_after_delivery", "cancelled"];

const FINISHED = ["delivered", "returned", "returned_after_delivery", "cancelled"];

/** الحالة الحالية فين في الخط — و`-1` لو بره الخط */
function positionOf(status: string): number {
  const i = JOURNEY.indexOf(status);
  if (i >= 0) return i;
  // اللي لسه ماوصلش الخط بيتحسب على أوله
  if (status === "new" || status === "packed") return 0;
  return -1;
}

export function trackView(status: string | null | undefined): TrackView {
  const s = String(status ?? "").trim();
  const copy = STATUS_COPY[s] ?? FALLBACK_COPY;
  const at = positionOf(s);

  const steps: TrackStep[] = JOURNEY.map((key, i) => ({
    label: STEP_LABELS[key] ?? key,
    done: at >= 0 && i < at,
    current: at === i && !STOPPED.includes(s),
  }));

  return { ...copy, steps, finished: FINISHED.includes(s) };
}

/**
 * لينك التتبع اللي بيتبعت للعميل.
 *
 * بيرجّع `null` لو الأوردر لسه مالوش شحنة — **مافيش حاجة تتتبع قبل ما
 * الشحنة تتعمل عند بوسطة**، ولينك على رقم فاضي بيفتح صفحة «مالقيناش».
 */
export function trackingLink(
  tracking: string | null | undefined,
  origin?: string | null
): string | null {
  const t = String(tracking ?? "").trim();
  if (!t) return null;
  const base = String(origin ?? "").trim() || "https://minis-system.vercel.app";
  const clean = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${clean}/track/${encodeURIComponent(t)}`;
}

"use client";

import { useState } from "react";
import { whatsappLink } from "@/lib/followup";

/**
 * قايمة السؤال بعد التسليم.
 *
 * ⚠️⚠️ **«ابعت للكل» مش إرسال جماعي حقيقي — ومش ممكن يكون.** واتساب العادي
 * مافيهوش طريقة تبعت من غير ما المستخدم يدوس «إرسال» بنفسه في التطبيق؛ اللي
 * بيفتح تلقائي هو **المحادثة والرسالة مكتوبة**. فالزرار هنا بيمشيك على
 * العملاء واحد ورا التاني: يفتح المحادثة، تدوس إرسال، ترجع، «اللي بعده».
 *
 * الإرسال الحقيقي بضغطة واحدة محتاج واتساب للأعمال (API) — وده حساب وموافقة
 * على نصوص الرسايل قبلها.
 *
 * ⚠️ **والتعديل بيفضل عايش وإنت بتلف** — لو عدّلت رسالة عميل وفتحت اللي
 * بعده، تعديلك مابيضيعش.
 */
export type FollowupItem = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string;
  days: number;
  message: string;
};

export function FollowupList({
  items,
  canMark,
  markAction,
}: {
  items: FollowupItem[];
  canMark: boolean;
  markAction: (formData: FormData) => void;
}) {
  // النص المعدّل لكل عميل — المفتاح هو معرّف الأوردر
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** فين واقفين في جولة «ابعت للكل» — `null` يعني مش في جولة */
  const [step, setStep] = useState<number | null>(null);

  const textOf = (it: FollowupItem) => edits[it.id] ?? it.message;

  const openFor = (it: FollowupItem) => {
    window.open(whatsappLink(it.customerPhone, textOf(it)), "_blank", "noopener");
  };

  const current = step !== null ? items[step] : null;

  return (
    <div className="space-y-3">
      {items.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow-sm">
          {step === null ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  openFor(items[0]);
                }}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                ابعت للكل ({items.length})
              </button>
              <span className="text-xs text-gray-500">
                بيفتح محادثة كل عميل بالرسالة مكتوبة، وإنت تدوس إرسال.
              </span>
            </>
          ) : (
            <>
              <span className="text-sm text-gray-900">
                {current
                  ? `${step + 1} من ${items.length} — ${current.customerName ?? "بدون اسم"}`
                  : "خلصت الجولة"}
              </span>
              {current && step + 1 < items.length && (
                <button
                  type="button"
                  onClick={() => {
                    const next = step + 1;
                    setStep(next);
                    openFor(items[next]);
                  }}
                  className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                >
                  اللي بعده
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep(null)}
                className="rounded-lg bg-white px-3 py-1.5 text-sm text-gray-500 shadow-sm hover:bg-gray-100"
              >
                وقّف
              </button>
            </>
          )}
        </div>
      )}

      {items.map((it, i) => (
        <div
          key={it.id}
          className={`rounded-xl bg-white p-4 shadow-sm sm:p-5 ${
            step === i ? "ring-2 ring-emerald-400" : ""
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium text-gray-900">
              {it.customerName ?? "بدون اسم"}
            </span>
            <span className="text-xs text-gray-500">
              #{it.orderNumber} · اتسلّم من {it.days} يوم
            </span>
          </div>

          <textarea
            value={textOf(it)}
            onChange={(e) =>
              setEdits((prev) => ({ ...prev, [it.id]: e.target.value }))
            }
            rows={3}
            className="mt-2 w-full rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openFor(it)}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              افتح واتساب
            </button>
            {canMark && (
              <form action={markAction}>
                <input type="hidden" name="orderId" value={it.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-white px-4 py-1.5 text-sm text-gray-600 shadow-sm hover:bg-gray-100"
                >
                  اتسأل خلاص
                </button>
              </form>
            )}
            <span className="text-xs text-gray-400" dir="ltr">
              {it.customerPhone}
            </span>
            {edits[it.id] !== undefined && edits[it.id] !== it.message && (
              <button
                type="button"
                onClick={() =>
                  setEdits((prev) => {
                    const next = { ...prev };
                    delete next[it.id];
                    return next;
                  })
                }
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                رجّع النص الأصلي
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

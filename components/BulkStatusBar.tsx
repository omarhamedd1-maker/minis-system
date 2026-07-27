"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

export function BulkStatusBar({
  returnTo,
  options,
  updateAction,
  canPrint = false,
  canStatus = false,
  canSend = false,
  sendAction,
}: {
  returnTo: string;
  options: Option[];
  updateAction: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  canPrint?: boolean;
  canStatus?: boolean;
  canSend?: boolean;
  sendAction?: (formData: FormData) => Promise<{
    ok: boolean;
    sent: number;
    skipped: number;
    failed: number;
    error?: string;
    details?: string;
  }>;
}) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState(options[0]?.value ?? "");
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const recount = () => {
      const checked = document.querySelectorAll<HTMLInputElement>(
        'input[data-order-checkbox]:checked'
      );
      setCount(checked.length);
      // مافيش حاجة متحددة؟ نقفل وضع التحديد على الموبايل
      if (checked.length === 0) {
        document.dispatchEvent(
          new CustomEvent("minis-select-mode", { detail: false })
        );
      }
    };
    document.addEventListener("change", recount);
    // كروت الموبايل بتبلّغنا لما التحديد يتغيّر (ضغطة طويلة)
    document.addEventListener("minis-selection-changed", recount);
    recount();
    return () => {
      document.removeEventListener("change", recount);
      document.removeEventListener("minis-selection-changed", recount);
    };
  }, []);

  function clearAll() {
    document
      .querySelectorAll<HTMLInputElement>("input[data-order-checkbox]")
      .forEach((el) => (el.checked = false));
    setCount(0);
    document.dispatchEvent(
      new CustomEvent("minis-select-mode", { detail: false })
    );
  }

  async function apply() {
    const checked = document.querySelectorAll<HTMLInputElement>(
      'input[data-order-checkbox]:checked'
    );
    if (checked.length === 0) return;
    const fd = new FormData();
    checked.forEach((el) => fd.append("order_ids", el.value));
    fd.append("status", status);
    fd.append("return_to", returnTo);
    setPending(true);
    const result = await updateAction(fd);
    setPending(false);
    if (!result.ok) {
      alert(result.error ?? "حصل خطأ");
      return;
    }
    // نفك التحديد ونخرج من وضع التحديد ونحدّث الصفحة من غير رستر
    clearAll();
    router.refresh();
  }

  // طباعة بوالص الأوردرات المحددة اللي ليها شحنة بوسطة
  function printSelected() {
    if (!canPrint) return;
    const checked = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        "input[data-order-checkbox]:checked"
      )
    );
    const withAwb = checked.filter((el) => el.dataset.hasAwb === "1");
    const withoutAwb = checked.length - withAwb.length;
    if (withAwb.length === 0) {
      alert("مفيش أوردر محدد اتبعت لبوسطة عشان نطبع بوليصته");
      return;
    }
    if (withoutAwb > 0) {
      const ok = confirm(
        `${withoutAwb} أوردر من المحددين لسه ماتبعتوش لبوسطة ومفيش ليهم بوليصة — هنطبع الباقي (${withAwb.length}). تمام؟`
      );
      if (!ok) return;
    }
    const ids = withAwb.map((el) => el.value).join(",");
    window.open(`/orders/print?ids=${ids}`, "_blank", "noopener");
  }

  // إرسال الأوردرات المحددة لبوسطة (اللي لسه مالهاش شحنة بس)
  async function sendSelected() {
    if (!sendAction) return;
    const checked = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        "input[data-order-checkbox]:checked"
      )
    );
    const sendable = checked.filter((el) => el.dataset.hasAwb !== "1");
    const already = checked.length - sendable.length;
    if (sendable.length === 0) {
      alert("كل الأوردرات المحددة معاها شحنة بالفعل");
      return;
    }
    let msg = `هنبعت ${sendable.length} أوردر لبوسطة كشحنات.`;
    if (already > 0) msg += ` (${already} معاهم شحنة هنتخطّاهم)`;
    msg += " تمام؟";
    if (!confirm(msg)) return;

    const fd = new FormData();
    sendable.forEach((el) => fd.append("order_ids", el.value));
    setSending(true);
    const result = await sendAction(fd);
    setSending(false);
    if (!result.ok) {
      alert(result.error ?? "حصل خطأ");
      return;
    }
    let summary = `اتبعت: ${result.sent}`;
    if (result.skipped) summary += ` — اتخطّى (معاهم شحنة): ${result.skipped}`;
    if (result.failed) {
      summary += ` — فشل: ${result.failed}`;
      if (result.details) summary += `\nالسبب: ${result.details}`;
    }
    alert(summary);
    clearAll();
    router.refresh();
  }

  if (count === 0) return null;

  return (
    <div className="sticky top-14 z-[35] mb-4 rounded-xl bg-gray-900 p-3 text-white shadow-lg md:top-0">
      {/* سطر فوق: العدد + إلغاء */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          محدّد {count} <span className="text-gray-400">أوردر</span>
        </span>
        <button
          type="button"
          onClick={clearAll}
          title="إلغاء التحديد"
          aria-label="إلغاء التحديد"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:bg-white/10 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* سطر تحت: الأكشنز */}
      <div className="mt-2 flex items-center gap-2">
        {canStatus && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="الحالة الجديدة"
              className="min-w-0 flex-1 rounded-lg border-0 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={apply}
              disabled={pending}
              title="طبّق الحالة"
              aria-label="طبّق الحالة"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-900 disabled:opacity-60"
            >
              {pending ? (
                <span className="text-[10px]">…</span>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          </div>
        )}
        {canPrint && (
          <button
            type="button"
            onClick={printSelected}
            title="طباعة البوالص"
            aria-label="طباعة البوالص"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
            </svg>
          </button>
        )}
        {canSend && sendAction && (
          <button
            type="button"
            onClick={sendSelected}
            disabled={sending}
            title="ابعت لبوسطة"
            aria-label="ابعت لبوسطة"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E30613] text-white hover:bg-[#b7050f] disabled:opacity-60"
          >
            {sending ? (
              <span className="text-[10px]">…</span>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function SelectAllCheckbox() {
  return (
    <input
      type="checkbox"
      aria-label="تحديد الكل"
      className="h-4 w-4 rounded border-gray-300"
      onChange={(e) => {
        const checked = e.target.checked;
        document
          .querySelectorAll<HTMLInputElement>('input[data-order-checkbox]')
          .forEach((el) => {
            el.checked = checked;
          });
        // نبعت حدث عشان الشريط يعيد العد
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}

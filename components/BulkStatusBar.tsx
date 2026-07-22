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
    };
    document.addEventListener("change", recount);
    recount();
    return () => document.removeEventListener("change", recount);
  }, []);

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
    // نفك التحديد ونحدّث الصفحة من غير رستر
    document
      .querySelectorAll<HTMLInputElement>("input[data-order-checkbox]")
      .forEach((el) => (el.checked = false));
    setCount(0);
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
    document
      .querySelectorAll<HTMLInputElement>("input[data-order-checkbox]")
      .forEach((el) => (el.checked = false));
    setCount(0);
    router.refresh();
  }

  if (count === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white">
      <span className="text-sm font-medium">محدّد {count} أوردر</span>
      {canStatus && (
        <>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border-0 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
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
            className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-60"
          >
            {pending ? "بيحفظ..." : "طبّق على المحدد"}
          </button>
        </>
      )}
      {canPrint && (
        <button
          type="button"
          onClick={printSelected}
          className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-gray-900 hover:bg-gray-100"
        >
          طباعة البوالص المحددة
        </button>
      )}
      {canSend && sendAction && (
        <button
          type="button"
          onClick={sendSelected}
          disabled={sending}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {sending ? "بيبعت..." : "ابعت المحدد لبوسطة"}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          document
            .querySelectorAll<HTMLInputElement>('input[data-order-checkbox]')
            .forEach((el) => (el.checked = false));
          setCount(0);
        }}
        className="text-xs text-gray-300 hover:text-white"
      >
        إلغاء التحديد
      </button>
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

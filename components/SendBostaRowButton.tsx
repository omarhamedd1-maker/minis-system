"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// زرار إرسال أوردر واحد لبوسطة من قايمة الأوردرات (من غير ما تفتح الأوردر)
export function SendBostaRowButton({
  orderId,
  orderNumber,
  sendAction,
}: {
  orderId: string;
  orderNumber: string;
  sendAction: (formData: FormData) => Promise<{
    ok: boolean;
    sent: number;
    skipped: number;
    failed: number;
    error?: string;
    details?: string;
  }>;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);

  async function send() {
    if (!confirm(`تبعت أوردر ${orderNumber} لبوسطة كشحنة؟`)) return;
    const fd = new FormData();
    fd.append("order_ids", orderId);
    setSending(true);
    const r = await sendAction(fd);
    setSending(false);
    if (!r.ok) {
      alert(r.error ?? "حصل خطأ");
      return;
    }
    if (r.failed) {
      alert(`معرفناش نبعت الشحنة${r.details ? ": " + r.details : ""}`);
    } else if (r.skipped) {
      alert("الأوردر ده معاه شحنة بالفعل");
    } else {
      alert("تم إرسال الأوردر لبوسطة");
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={sending}
      title="ابعت لبوسطة"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#E30613] hover:bg-red-100 disabled:opacity-50"
    >
      {sending ? (
        <span className="text-[10px]">…</span>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      )}
    </button>
  );
}

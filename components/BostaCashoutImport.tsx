"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// رفع ملف معاملات محفظة بوسطة — بناخد منه التحويلات اللي وصلتك ونسجّلها في الخزنة
export function BostaCashoutImport({
  importAction,
}: {
  importAction: (fd: FormData) => Promise<{
    ok: boolean;
    added?: number;
    skipped?: number;
    error?: string;
  }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    setMsg(null);
    const r = await importAction(fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!r.ok) {
      setIsError(true);
      setMsg(r.error ?? "حصل خطأ");
      return;
    }
    setIsError(false);
    setMsg(
      r.added === 0
        ? `مفيش تحويلات جديدة (${r.skipped ?? 0} كانوا مسجّلين قبل كده)`
        : `تم تسجيل ${r.added} تحويل في الخزنة${r.skipped ? ` — و${r.skipped} كانوا مسجّلين قبل كده` : ""}`
    );
    router.refresh();
  }

  return (
    <details className="rounded-xl bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-bold text-gray-900">
        استيراد تحويلات بوسطة
      </summary>
      <p className="mt-2 text-xs text-gray-500">
        بوسطة مش بتسمح لنا نقرأ المحفظة تلقائياً. نزّل ملف المعاملات من بوسطة
        (المحفظة ← تحميل) وارفعه هنا — هناخد منه الفلوس اللي حوّلوها لك ونسجّلها
        إيداع في الخزنة. لو رفعت نفس الملف تاني مش هيتكرر حاجة.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onPick}
          disabled={busy}
          className="text-xs text-gray-600 file:me-2 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
        />
        {busy && <span className="text-xs text-gray-500">بيقرا الملف...</span>}
      </div>
      {msg && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            isError ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {msg}
        </p>
      )}
    </details>
  );
}

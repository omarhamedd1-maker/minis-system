"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ApplyResult,
  PreviewResult,
  StatementInput,
} from "@/app/(dashboard)/cash/payout-actions";

/**
 * رفع كشف محفظة شركة الشحن — **معاينة قبل التسجيل** (TRANSFERS §٩).
 *
 * ⚠️ **المعاينة مابتكتبش حاجة**، والتسجيل بياخد **نفس النص** فيحسب الخطة من
 * الأول. يعني اللي شفته هو اللي بيتسجّل.
 *
 * ⚠️ **ومفيش حركة خزنة بتتعمل** — الاستيراد بيربط بالحركات اليدوية الموجودة،
 * واللي مالوش حركة بيتسجّل «محتاج مراجعة».
 */
export function ImportStatement({
  previewAction,
  applyAction,
}: {
  previewAction: (input: StatementInput) => Promise<PreviewResult>;
  applyAction: (input: StatementInput) => Promise<ApplyResult>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  /** ملف إكسل متقري base64 — بيتبعت زي ما هو والسيرفر بيحوّله */
  const [xlsx, setXlsx] = useState<{ name: string; base64: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);

  /**
   * ⚠️⚠️ **اختيار ملف جديد بيمسح اللي قبله بالكامل.** قبل كده الاختيار
   * الجديد ماكانش بيشيل النص القديم، فالشاشة تفضل على الملف الأول
   * والمعاينة تعرض بياناته — وانت مختار الملف الصح.
   */
  async function readFile(file: File) {
    setPreview(null);
    setDone(null);
    setFileError(null);
    setText("");
    setXlsx(null);

    // ⚠️ **كشف بوسطة بينزل `.xlsx`** — والتحويل لـCSV بإيد المستخدم خطوة
    // زيادة بتقع مع كل مشتري (§٩)
    if (/\.(xlsx|xlsm)$/i.test(file.name)) {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) {
        bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      }
      setXlsx({ name: file.name, base64: btoa(bin) });
      return;
    }
    if (/\.(csv|tsv|txt)$/i.test(file.name) || file.type.startsWith("text/")) {
      setText(await file.text());
      return;
    }
    // ⚠️ **النوع المرفوض بيتقال** — السكوت بيخلّي الشاشة تفضل على القديم
    setFileError(`الملف ده نوعه مش مدعوم (${file.name}) — ارفع xlsx أو CSV`);
  }

  const chosen = (): StatementInput | null =>
    xlsx ? { xlsxBase64: xlsx.base64 } : text.trim() ? { text } : null;

  async function run() {
    const i = chosen();
    if (!i) return;
    setBusy(true);
    setDone(null);
    setPreview(await previewAction(i));
    setBusy(false);
  }

  async function save() {
    const i = chosen();
    if (!i) return;
    setBusy(true);
    const r = await applyAction(i);
    setBusy(false);
    setDone(r);
    setPreview(null);
    if (r.ok) {
      setText("");
      setXlsx(null);
      router.refresh();
    }
  }

  const plan = preview?.ok ? preview.plan : null;

  return (
    <details className="group rounded-card bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-control bg-primary text-white transition-transform group-open:rotate-45"
        >
          +
        </span>
        رفع كشف المحفظة
      </summary>

      <div className="space-y-3 border-t border-line p-4">
        <p className="text-xs text-ink-muted">
          نزّل الكشف من لوحة شركة الشحن وارفعه زي ما هو (xlsx)، أو الصق محتواه
          هنا. الرفع بيربط التحويلات بالحركات المسجّلة — ومابيعملش حركة خزنة
          جديدة.
        </p>

        <input
          type="file"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
          }}
          className="block w-full text-xs text-ink-muted file:me-3 file:rounded-control file:border-0 file:bg-sunken file:px-3 file:py-2 file:text-xs file:text-ink-body"
        />

        {/* ⚠️ اللي اتقرا فعلًا بيتقال بالاسم — مش اللي الرافع فاكره */}
        {xlsx && (
          <p className="rounded-control bg-sunken px-3 py-1.5 text-xs text-ink-body">
            الملف المقروء: <b className="font-mono">{xlsx.name}</b>
          </p>
        )}
        {fileError && (
          <p className="rounded-control bg-danger-soft px-3 py-1.5 text-xs text-danger">
            {fileError}
          </p>
        )}

        <textarea
          value={xlsx ? "" : text}
          disabled={Boolean(xlsx)}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          rows={4}
          dir="ltr"
          placeholder={xlsx ? "الملف المرفوع هو اللي هيتقرا" : "Invoice Number,Date,COD,Fees,Net Amount,Orders"}
          className="w-full rounded-control border border-line-strong px-3 py-2 font-mono text-xs text-ink focus:border-primary focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || chosen() === null}
            className="rounded-control bg-sunken px-4 py-2 text-sm font-medium text-ink-body hover:bg-line disabled:opacity-50"
          >
            {busy && !plan ? "بنقرا…" : "اقرا الكشف"}
          </button>
          {plan && plan.totals.all > 0 && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
            >
              سجّل الربط
            </button>
          )}
        </div>

        {preview && !preview.ok && (
          <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {preview.error}
          </p>
        )}

        {done && (
          <p
            className={`rounded-control px-3 py-2 text-sm ${
              done.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            {done.ok
              ? `اتسجّل ${done.saved} تحويل متطابق · ${done.needsReview} محتاج مراجعة · ${done.skipped} كان متسجّل قبل كده`
              : done.error}
          </p>
        )}

        {plan && (
          <div className="space-y-2">
            <p className="text-xs text-ink-body">
              {plan.totals.all} تحويل · {plan.totals.matched} متطابق ·{" "}
              {plan.totals.needsReview} محتاج مراجعة · {plan.totals.duplicates}{" "}
              متسجّل قبل كده
            </p>
            {/*
              ⚠️⚠️ **الملف المقصوص شكله زي الكامل.** الكشف الأصلي ٨ أعمدة
              وفيه `Category` — واللي اتقصّ لتلات أعمدة بيرفع التحويلات
              عادي **والرسوم بتضيع في صمت**. حصل مرتين (CONTEXT قاعدة ٩)،
              فالمعاينة بقت تقول الملف ده أنهي واحد **قبل** التسجيل.
            */}
            {preview?.ok && preview.ledgerCount > 0 ? (
              <p className="rounded-control bg-success-soft px-3 py-1.5 text-xs text-success">
                كشف كامل — ومعاه {preview.ledgerCount} بند رسوم
              </p>
            ) : (
              <p className="rounded-control bg-warning-soft px-3 py-1.5 text-xs text-warning">
                ⚠️ الملف ده مافيهوش عمود <b>Category</b> — التحويلات هتترفع
                والرسوم لأ. نزّل الكشف الأصلي من بوسطة (٨ أعمدة).
              </p>
            )}
            {plan.totals.rounding !== 0 && (
              // ⚠️ القروش دي فرق حقيقي في الرصيد — بتتسجّل على كل تحويل
              <p className="text-xs text-ink-muted">
                فروق التقريب في الحركات اليدوية: {plan.totals.rounding} جنيه
              </p>
            )}
            <div className="max-h-72 overflow-y-auto rounded-control border border-line">
              {plan.rows.map((r) => (
                <div
                  key={r.row.invoiceNumber}
                  className="border-b border-line px-3 py-2 text-xs last:border-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-ink">{r.row.invoiceNumber}</span>
                    <span className="tabular-nums text-ink-body">{r.row.net}</span>
                    <span
                      className={
                        r.status === "matched"
                          ? "text-success"
                          : r.status === "duplicate"
                            ? "text-ink-faint"
                            : "text-warning"
                      }
                    >
                      {r.status === "matched"
                        ? `متطابق · ${r.orderIds.length} أوردر`
                        : r.status === "duplicate"
                          ? "متسجّل قبل كده"
                          : "محتاج مراجعة"}
                    </span>
                  </div>
                  {r.reason && <p className="mt-0.5 text-warning">{r.reason}</p>}
                </div>
              ))}
            </div>
            {preview?.ok && preview.problems.length > 0 && (
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer">
                  {preview.problems.length} سطر مااتقراش
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {preview.problems.slice(0, 20).map((p) => (
                    <li key={`${p.line}-${p.reason}`}>
                      سطر {p.line}: {p.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

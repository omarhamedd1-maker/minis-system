"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportPayload } from "@/lib/import-runs";

export type ImportRunRow = {
  id: string;
  kind: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
  undoneAt: string | null;
  undoLines: string[];
};

const KIND_LABEL: Record<string, string> = {
  products: "جلب منتجات",
  orders: "جلب أوردرات",
  shipments: "ربط شحنات",
  costs: "رفع تكاليف",
};

/**
 * سجل الاستيراد مع التراجع.
 *
 * أي جلب بيعمل عشرات الصفوف مرة واحدة. من غير الزرار ده، الرجوع بيبقى شغل
 * يدوي في قاعدة البيانات — وده بالظبط اللي المفروض العميل الجديد مايعملهوش.
 */
export function ImportHistory({
  runs,
  undoAction,
}: {
  runs: ImportRunRow[];
  undoAction: (
    runId: string
  ) => Promise<{ ok: boolean; error?: string; removed?: number }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function undo(run: ImportRunRow) {
    const what = run.undoLines.length
      ? "\n\n" + run.undoLines.join("\n")
      : "";
    if (!confirm(`تتراجع عن "${run.summary}"؟${what}`)) return;

    setBusy(run.id);
    setError(null);
    const r = await undoAction(run.id);
    setBusy(null);
    if (!r.ok) setError(r.error ?? "حصل خطأ");
    else router.refresh();
  }

  if (runs.length === 0) return null;

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900">سجل الاستيراد</h2>
      <p className="mt-0.5 text-xs text-gray-500">
        كل جلب اتعمل، ولو طلع غلط تقدر ترجّعه.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-1">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-2.5 py-2 text-xs"
          >
            <div className="min-w-0">
              <span className="text-gray-900">
                {KIND_LABEL[run.kind] ?? run.kind}: {run.summary}
              </span>
              <span className="block text-[11px] text-gray-400">
                {run.createdAt}
                {run.actorName && ` — ${run.actorName}`}
              </span>
            </div>

            {run.undoneAt ? (
              <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">
                اترجع
              </span>
            ) : run.undoLines.length === 0 ? (
              <span className="shrink-0 text-[11px] text-gray-400">—</span>
            ) : (
              <button
                type="button"
                onClick={() => undo(run)}
                disabled={busy === run.id}
                className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {busy === run.id ? "بنرجّع…" : "ارجع عنه"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { ImportPayload };

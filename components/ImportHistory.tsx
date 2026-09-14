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
    <div className="rounded-card bg-surface p-5 shadow-card">
      <h2 className="text-sm font-bold text-ink">سجل الاستيراد</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        كل جلب اتعمل، ولو طلع غلط تقدر ترجّعه.
      </p>

      {error && (
        <p className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-1">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center justify-between gap-3 rounded-control bg-sunken px-2.5 py-2 text-xs"
          >
            <div className="min-w-0">
              <span className="text-ink">
                {KIND_LABEL[run.kind] ?? run.kind}: {run.summary}
              </span>
              <span className="block text-[11px] text-ink-faint">
                {run.createdAt}
                {run.actorName && ` — ${run.actorName}`}
              </span>
            </div>

            {run.undoneAt ? (
              <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-[11px] text-ink-muted">
                اترجع
              </span>
            ) : run.undoLines.length === 0 ? (
              <span className="shrink-0 text-[11px] text-ink-faint">—</span>
            ) : (
              <button
                type="button"
                onClick={() => undo(run)}
                disabled={busy === run.id}
                className="shrink-0 rounded-control bg-surface px-2.5 py-1 text-[11px] font-medium text-danger shadow-card transition-colors hover:bg-danger-soft disabled:opacity-50"
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  RoundingApply,
  RoundingPreview,
} from "@/app/(dashboard)/cash/payout-actions";

/**
 * ==========================================================================
 * «صلّح كل الفروق» — التقريب المتراكم على الحركات اليدوية
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **المعاينة قبل التنفيذ شرط** (قرار عمر ٢٢ سبتمبر): العدد والمجموع
 * بيبانوا الأول، وكل سطر بقيمته القديمة والجديدة. الزرار اللي بيغيّر
 * الرصيد من غير ما يقول هيغيّره بكام مايتدسّش.
 *
 * ⚠️ **وكل تعديل بيتسجّل في النشاط لوحده** بالقيمتين — سطر واحد بيقول
 * «اتصلّح ٢٣» مابيسمحش بمراجعة واحد فيهم.
 * ==========================================================================
 */
export function FixRounding({
  previewAction,
  applyAction,
}: {
  previewAction: () => Promise<RoundingPreview>;
  applyAction: () => Promise<RoundingApply>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<RoundingPreview | null>(null);
  const [done, setDone] = useState<RoundingApply | null>(null);

  const money = (n: number) =>
    new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(n);

  async function look() {
    setBusy(true);
    setDone(null);
    setPlan(await previewAction());
    setBusy(false);
  }

  async function apply() {
    setBusy(true);
    const r = await applyAction();
    setBusy(false);
    setDone(r);
    setPlan(null);
    if (r.ok) router.refresh();
  }

  return (
    /*
      ⚠️ **الزرار جنب سطر الفروق نفسه** (قرار عمر ٢٢ سبتمبر) — كان كرت
      لوحده تحت، فاللي بيقرا السطر مايلاقيش الفعل جنبه.
    */
    <div className="mt-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void look()}
        className="min-h-9 rounded-control border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-body hover:bg-sunken disabled:opacity-50"
      >
        {busy && !plan ? "بيحسب…" : "صلّح كل الفروق"}
      </button>

      {plan && plan.ok && plan.rows.length === 0 && (
        <p className="mt-3 text-xs text-success">مفيش فروق — كل حركة بالرقم الصح.</p>
      )}

      {plan && !plan.ok && (
        <p className="mt-3 text-xs text-danger">{plan.error}</p>
      )}

      {plan && plan.ok && plan.rows.length > 0 && (
        <div className="mt-3 rounded-control bg-sunken p-3">
          {/* ⚠️ العدد والمجموع قبل أي تنفيذ */}
          <p className="text-sm font-medium text-ink">
            {plan.rows.length} تحويل · الرصيد هيزيد{" "}
            <span className="tabular-nums">{money(plan.total)}</span>
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[11px] text-ink-muted">
            {plan.rows.map((r) => (
              <li key={r.payoutId} className="flex flex-wrap justify-between gap-2">
                <span className="font-mono">{r.invoice}</span>
                <span className="tabular-nums">
                  {money(r.oldAmount)} ← {money(r.newAmount)}
                  <span className="ms-1 text-ink-faint">({money(r.difference)})</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply()}
              className="min-h-9 rounded-control bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {busy ? "بيصلّح…" : "أيوه، صلّح"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPlan(null)}
              className="min-h-9 rounded-control px-3 py-1.5 text-xs text-ink-muted hover:bg-line"
            >
              سيبها
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            كل حركة قديمة بتتلغي بحركة عكسية وبتتعمل واحدة بالرقم الصح —
            مفيش تعديل في مكانه، والدفتر بيفضل فيه الأثر.
          </p>
        </div>
      )}

      {done && (
        <p className={`mt-3 text-xs ${done.ok ? "text-success" : "text-danger"}`}>
          {done.ok
            ? `اتصلّح ${done.fixed} تحويل · الرصيد زاد ${money(done.total)}` +
              (done.failed ? ` · ${done.failed} مااتصلّحوش` : "")
            : done.error}
        </p>
      )}
    </div>
  );
}

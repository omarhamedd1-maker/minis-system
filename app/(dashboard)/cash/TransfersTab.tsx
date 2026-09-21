import { createAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/fetch-all-pages";
import { cairoToday, formatDate, formatMoney } from "@/lib/format";
import { can, type SessionUser } from "@/lib/permissions";
import { ImportStatement } from "@/components/ImportStatement";
import { AddPayout } from "@/components/AddPayout";
import { PayoutReview } from "@/components/PayoutReview";
import { linkToManualCash } from "@/lib/payout-match";
import {
  acceptPayoutDiff,
  addPayoutManually,
  applyPayoutImport,
  createPayoutCash,
  fixPayoutCash,
  previewPayoutImport,
} from "./payout-actions";

/**
 * ==========================================================================
 * تاب التحويلات (TRANSFERS §٨ · الخطوة ٣)
 * --------------------------------------------------------------------------
 * كل تحويل من شركة الشحن: رقمه ومبلغه وأوردراته ورسومه.
 *
 * ⚠️ **المحتاج مراجعة فوق** — ده الشغل الوحيد المطلوب من الصفحة دي.
 * ⚠️ **الرسوم بتتعرض ومابتدخلش الربح** — متخصومة من كل أوردر أصلًا (§٧).
 * ==========================================================================
 */

type PayoutRow = {
  id: string;
  invoice_number: string;
  payout_date: string;
  gross_amount: number;
  fees_amount: number;
  net_amount: number;
  order_count: number | null;
  status: string;
  review_reason: string | null;
  cash_transaction_id: string | null;
  /** فرق التقريب بين التحويل والحركة اليدوية — `sql/transfers-02-rounding.sql` */
  rounding_diff: number | null;
  courier_payout_orders: { id: string }[];
};

const STATUS: Record<string, { label: string; className: string }> = {
  matched: { label: "متطابق", className: "text-success" },
  confirmed: { label: "متأكّد", className: "text-success" },
  needs_review: { label: "محتاج مراجعة", className: "text-warning" },
};

export async function TransfersTab({ user }: { user: SessionUser }) {
  const db = createAdminClient();
  // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد العزل
  const { data, error } = await allRows(db
    .from("courier_payouts")
    .select(
      "id, invoice_number, payout_date, gross_amount, fees_amount, net_amount, order_count, status, review_reason, cash_transaction_id, rounding_diff, courier_payout_orders(id)"
    )
    .eq("tenant_id", user.tenantId)
    .order("payout_date", { ascending: false })
    .overrideTypes<PayoutRow[]>());

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        معرفناش نقرا التحويلات: {error.message}
        <br />
        لو الجداول لسه ماتعملتش، شغّل <code>sql/transfers-01-tables.sql</code>.
      </div>
    );
  }

  const rows = data ?? [];

  // الحركة اليدوية القريبة من كل تحويل محتاج مراجعة — بنفس منطق الاستيراد،
  // عشان شاشة المراجعة تعرف تقول «صلّح» ولا «اعمل حركة»
  const open = rows.filter((r) => r.status === "needs_review" && !r.cash_transaction_id);
  const { data: manual } = open.length
    ? await allRows(db
        .from("cash_transactions")
        .select("id, amount, transaction_date, related_payout_id")
        .eq("tenant_id", user.tenantId)
        .eq("source_type", "manual")
        .eq("direction", "in")
        .overrideTypes<
          { id: string; amount: number; transaction_date: string; related_payout_id: string | null }[]
        >())
    : { data: [] };
  const free = (manual ?? [])
    .filter((c) => !c.related_payout_id)
    .map((c) => ({ id: c.id, amount: Number(c.amount), date: String(c.transaction_date).slice(0, 10) }));
  const candidates = new Map<string, { id: string; amount: number; difference: number }>();
  for (const r of open) {
    // ⚠️ من غير سماح — عايزين الحركة اللي فرقها كبير عشان نعرضه
    const hit = linkToManualCash(
      { net: Number(r.net_amount), date: r.payout_date },
      free,
      new Set([...candidates.values()].map((c) => c.id))
    );
    if (hit.kind === "diff") {
      const amount = free.find((c) => c.id === hit.cashId)?.amount ?? 0;
      candidates.set(r.id, { id: hit.cashId, amount, difference: hit.difference });
    }
  }
  const review = rows.filter((r) => r.status === "needs_review");
  const total = rows.reduce((s, r) => s + Number(r.net_amount), 0);
  const fees = rows.reduce((s, r) => s + Number(r.fees_amount), 0);
  // ⚠️ فروق التقريب فرق حقيقي في الرصيد — الحركات اليدوية مكتوبة بالجنيه
  const rounding =
    Math.round(rows.reduce((s, r) => s + Number(r.rounding_diff ?? 0), 0) * 100) / 100;
  const canEdit = can(user, "cash.edit");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">تحويلات شركة الشحن</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink sm:text-3xl">
            {formatMoney(total)}
            <span className="ms-2 text-sm font-normal text-ink-muted">
              · {rows.length} تحويل
            </span>
          </p>
          {rounding !== 0 && (
            <p className="mt-0.5 text-xs text-ink-muted">
              فروق تقريب في الحركات اليدوية: {formatMoney(rounding)} — فرق حقيقي
              في الرصيد، مستني تسوية
            </p>
          )}
          {fees > 0 && (
            <p className="mt-0.5 text-xs text-ink-faint">
              رسوم {formatMoney(fees)} — متخصومة على كل أوردر أصلًا، فمابتتطرحش
              تاني من الربح
            </p>
          )}
        </div>
      </div>

      {canEdit && <AddPayout action={addPayoutManually} today={cairoToday()} />}

      {canEdit && (
        <ImportStatement
          previewAction={previewPayoutImport}
          applyAction={applyPayoutImport}
        />
      )}

      {review.length > 0 && (
        <div className="rounded-control bg-warning-soft px-4 py-3 text-sm text-warning">
          ⚠️ {review.length} تحويل محتاج مراجعة — تحت بالسبب.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-card bg-surface p-12 text-center text-sm text-ink-muted shadow-card">
          لسه مفيش تحويلات متسجّلة. ارفع كشف المحفظة من فوق — بيربط التاريخ كله
          مرة واحدة.
        </div>
      ) : (
        <div className="space-y-2">
          {[...review, ...rows.filter((r) => r.status !== "needs_review")].map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, className: "text-ink-muted" };
            return (
              <div key={r.id} className="rounded-card bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold text-ink">
                    {formatMoney(Number(r.net_amount))}
                  </span>
                  <span className={`text-xs font-medium ${st.className}`}>
                    {st.label}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span>{formatDate(r.payout_date)}</span>
                  <span className="font-mono">{r.invoice_number}</span>
                  <span>
                    {r.courier_payout_orders?.length ?? 0}
                    {r.order_count ? ` من ${r.order_count}` : ""} أوردر
                  </span>
                  {Number(r.fees_amount) > 0 && (
                    <span>رسوم {formatMoney(Number(r.fees_amount))}</span>
                  )}
                  {r.cash_transaction_id ? (
                    <span className="text-success">مربوط بحركة خزنة</span>
                  ) : (
                    <span className="text-warning">مش مربوط بحركة</span>
                  )}
                </div>
                {Number(r.rounding_diff ?? 0) !== 0 && (
                  <p className="mt-1 text-xs text-ink-faint">
                    مقرّب — فرق {formatMoney(Number(r.rounding_diff))}
                  </p>
                )}
                {r.review_reason && (
                  <p className="mt-2 text-xs text-warning">{r.review_reason}</p>
                )}
                {canEdit && r.status === "needs_review" && !r.cash_transaction_id && (
                  <PayoutReview
                    payoutId={r.id}
                    net={Number(r.net_amount)}
                    candidate={candidates.get(r.id) ?? null}
                    createAction={createPayoutCash}
                    fixAction={fixPayoutCash}
                    acceptAction={acceptPayoutDiff}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

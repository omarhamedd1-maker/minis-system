import { createAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/fetch-all-pages";
import { cairoToday, formatDate, formatMoney } from "@/lib/format";
import { can, type SessionUser } from "@/lib/permissions";
import { ImportStatement } from "@/components/ImportStatement";
import { AddPayout } from "@/components/AddPayout";
import { PayoutReview } from "@/components/PayoutReview";
import { linkToManualCash } from "@/lib/payout-match";
import { stalePayouts } from "@/lib/payout-health";
import { liveManualCash } from "@/lib/payout-cash";
import {
  acceptPayoutDiff,
  addPayoutManually,
  applyPayoutImport,
  createPayoutCash,
  fixPayoutCash,
  previewPayoutImport,
  archivePayout,
  cancelPayout,
  unlinkPayoutCash,
  rematchPayout,
} from "./payout-actions";
import { PayoutActions } from "@/components/PayoutActions";

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
  /** متخفي من التاب ولسه في التاريخ — `sql/transfers-04-actions.sql` */
  archived?: boolean | null;
  courier_payout_orders: { id: string }[];
};

const STATUS: Record<string, { label: string; className: string }> = {
  matched: { label: "متطابق", className: "text-success" },
  confirmed: { label: "متأكّد", className: "text-success" },
  needs_review: { label: "محتاج مراجعة", className: "text-warning" },
};

export async function TransfersTab({ user }: { user: SessionUser }) {
  const db = createAdminClient();
  const BASE =
    "id, invoice_number, payout_date, gross_amount, fees_amount, net_amount, order_count, status, review_reason, cash_transaction_id, rounding_diff, courier_payout_orders(id)";
  // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد العزل
  const read = (cols: string) =>
    allRows(db
      .from("courier_payouts")
      .select(cols)
      .eq("tenant_id", user.tenantId)
      .order("payout_date", { ascending: false })
      .overrideTypes<PayoutRow[]>());
  // ⚠️ `archived` من `sql/transfers-04-actions.sql` — لحد ما يتشغّل
  // بنقرا من غيره، والتاب بيشتغل عادي
  let { data, error } = await read(`${BASE}, archived`);
  if (error?.code === "42703") ({ data, error } = await read(BASE));

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        معرفناش نقرا التحويلات: {error.message}
        <br />
        لو الجداول لسه ماتعملتش، شغّل <code>sql/transfers-01-tables.sql</code>.
      </div>
    );
  }

  // ===== ⚠️ فحص: «متأكّد» وتحته حركة اتلغت =====
  //
  // ⚠️⚠️ **دي أوحش من الغلط الواضح** — الشاشة بتقول تمام فمحدش بيراجع.
  // حصلت على مينيز (٥,٦٩١ · `MANUAL20260921`): الحركة اتلغت والتحويل فضل
  // «متأكّد». الفحص بيرجّعه «محتاج مراجعة» **وسببه مكتوب**.
  //
  // ⚠️ **مابيلمسش فلوس** — بيصحّح وصف التحويل بس (`lib/payout-health.ts`).
  const loaded = data ?? [];
  const cashIds = loaded
    .map((r) => r.cash_transaction_id)
    .filter((v): v is string => Boolean(v));
  if (cashIds.length > 0) {
    const [{ data: reversedRows }, { data: liveRows }] = await Promise.all([
      allRows(db
        .from("cash_transactions")
        .select("reversal_of")
        .eq("tenant_id", user.tenantId)
        .in("reversal_of", cashIds)
        .overrideTypes<{ reversal_of: string }[]>()),
      allRows(db
        .from("cash_transactions")
        .select("id")
        .eq("tenant_id", user.tenantId)
        .in("id", cashIds)
        .overrideTypes<{ id: string }[]>()),
    ]);
    const reversed = new Set((reversedRows ?? []).map((r) => r.reversal_of));
    const live = new Set((liveRows ?? []).map((r) => r.id));
    const missing = new Set(cashIds.filter((id) => !live.has(id)));
    const stale = stalePayouts(
      loaded.map((r) => ({
        id: r.id,
        status: r.status,
        cashTransactionId: r.cash_transaction_id,
      })),
      reversed,
      missing
    );
    for (const s of stale) {
      await db
        .from("courier_payouts")
        .update({ status: "needs_review", review_reason: s.reason })
        .eq("tenant_id", user.tenantId)
        .eq("id", s.id);
      // الشاشة بتعرض المصحَّح على طول — مش مستنية تحديث تاني
      const row = loaded.find((r) => r.id === s.id);
      if (row) {
        row.status = "needs_review";
        row.review_reason = s.reason;
      }
    }
  }

  // ⚠️ **المتأرشف بيتشال من العرض بس** — لسه في التاريخ، وعشان كده
  // الأرقام فوق (المجموع والرسوم) بتتحسب على الكل مش على الظاهر
  const all = loaded;
  const hidden = all.filter((r) => r.archived === true);
  const rows = all.filter((r) => r.archived !== true);

  // الحركة اليدوية القريبة من كل تحويل محتاج مراجعة — بنفس منطق الاستيراد،
  // عشان شاشة المراجعة تعرف تقول «صلّح» ولا «اعمل حركة»
  // ⚠️⚠️ **والملغية برّه المرشحين** — الحركة الملغية بتفضل في الدفتر
  // ومجموعها صفر، فالربط بيها بيقول «مربوط» والفلوس مش في الرصيد
  // (`lib/payout-cash.ts`)
  const open = rows.filter((r) => r.status === "needs_review" && !r.cash_transaction_id);
  const free = open.length ? await liveManualCash(db, user.tenantId) : [];
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
  // ⚠️ **على الكل مش على الظاهر** — الإخفاء بيخفي من عينك مش من حسابك
  const total = all.reduce((s, r) => s + Number(r.net_amount), 0);
  const fees = all.reduce((s, r) => s + Number(r.fees_amount), 0);
  // ⚠️ فروق التقريب فرق حقيقي في الرصيد — الحركات اليدوية مكتوبة بالجنيه
  const rounding =
    Math.round(all.reduce((s, r) => s + Number(r.rounding_diff ?? 0), 0) * 100) / 100;
  const canEdit = can(user, "cash.edit");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">تحويلات شركة الشحن</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink sm:text-3xl">
            {formatMoney(total)}
            <span className="ms-2 text-sm font-normal text-ink-muted">
              · {all.length} تحويل
            </span>
          </p>
          {/* ⚠️ اللي متخفي لازم يتقال — الصفحة اللي بتخفي بالصمت بتكدب */}
          {hidden.length > 0 && (
            <p className="mt-0.5 text-xs text-ink-faint">
              {hidden.length} متخفي — لسه محسوبين في الرقم ده
            </p>
          )}
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
                    rematchAction={rematchPayout}
                  />
                )}
                {canEdit && (
                  <PayoutActions
                    payoutId={r.id}
                    linked={Boolean(r.cash_transaction_id)}
                    archived={r.archived === true}
                    unlinkAction={unlinkPayoutCash}
                    cancelAction={cancelPayout}
                    archiveAction={archivePayout}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* المتخفي — بيفضل يوصله من هنا، وإلا الإخفاء بيبقى حذف باسم تاني */}
      {hidden.length > 0 && (
        <details className="rounded-card bg-surface p-4 shadow-card">
          <summary className="cursor-pointer text-sm text-ink-muted">
            المتخفي ({hidden.length})
          </summary>
          <div className="mt-3 space-y-2">
            {hidden.map((r) => (
              <div key={r.id} className="rounded-control bg-sunken p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold text-ink">
                    {formatMoney(Number(r.net_amount))}
                  </span>
                  <span className="font-mono text-xs text-ink-muted">
                    {r.invoice_number}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {formatDate(r.payout_date)}
                </p>
                {canEdit && (
                  <PayoutActions
                    payoutId={r.id}
                    linked={Boolean(r.cash_transaction_id)}
                    archived
                    unlinkAction={unlinkPayoutCash}
                    cancelAction={cancelPayout}
                    archiveAction={archivePayout}
                  />
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

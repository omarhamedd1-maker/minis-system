import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cairoToday, formatDate, formatMoney } from "@/lib/format";
import { CashManualRow } from "@/components/CashManualRow";
import { CashCard } from "@/components/CashCard";
import { can, type SessionUser } from "@/lib/permissions";
import { SubmitOnce } from "@/components/SubmitOnce";
import type { CashTotals } from "@/lib/cash-totals";
import { cashRowLabel, type CashLabelRow } from "@/lib/cash-label";
import { cashSourceNote } from "@/lib/cash-reversal";
import {
  dayHasHeader,
  groupByDay,
  withRunningBalance,
  type LedgerDay,
} from "@/lib/cash-ledger";
import { ShowMore } from "@/components/ShowMore";
import {
  addCashTransaction,
  deleteCashTransaction,
  setOpeningBalance,
  updateCashTransaction,
} from "./actions";
import { OPENING, OPENING_LABEL, latestOpeningDate } from "@/lib/cash-opening";
import { resolveShowCount } from "@/lib/show-more";
import { allRows } from "@/lib/fetch-all-pages";

/** الخزنة بتعرض ١٠٠ حركة في المرة — زي ما كانت */
const CASH_STEP = 100;

/** فلتر الاتجاه — الخارج بيبقى مدفون وسط الداخل من غيره */
const DIRECTIONS = [
  { key: "", label: "الكل" },
  { key: "in", label: "داخل" },
  { key: "out", label: "خارج" },
] as const;

/** العربي: ٣ لـ١٠ «حركات» — غير كده «حركة» */
const moves = (n: number) => `${n} ${n >= 3 && n <= 10 ? "حركات" : "حركة"}`;

type CashRow = CashLabelRow & {
  id: string;
  amount: number;
  transaction_date: string | null;
  /** sql/cash-audit.sql — فاضيين في الحركات القديمة */
  created_by_name: string | null;
  origin: string | null;
};

/**
 * تاب «الحركات» — دفتر الخزنة.
 * الرصيد بيتحسب في الصفحة الأم (`loadCashTotals`) وبييجي هنا جاهز.
 */
export async function MovesTab({
  params,
  user,
  totals,
}: {
  params: {
    error?: string;
    saved?: string;
    deleted?: string;
    show?: string;
    dir?: string;
  };
  user: SessionUser;
  totals: CashTotals;
}) {
  const { error: actionError, saved, deleted, show, dir: rawDir } = params;
  const dir = rawDir === "in" || rawDir === "out" ? rawDir : "";
  const showCount = resolveShowCount(show, CASH_STEP);
  const isAdmin = can(user, "cash.edit");
  const supabase = await createClient();

  let rowsQuery = supabase
    .from("cash_transactions")
    .select(
      "id, direction, amount, source_type, description, transaction_date, created_by_name, origin, orders(order_number, customers(full_name)), expenses(category, description)"
    );
  if (dir) rowsQuery = rowsQuery.eq("direction", dir);

  const rowsResult = await rowsQuery
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      // ⚠️ ترتيب ثابت للآخر — الرصيد الجاري بيعتمد إن الترتيب مايتغيّرش بين تحميلتين
      .order("id", { ascending: false })
      .limit(showCount)
      .overrideTypes<CashRow[]>();

  if (rowsResult.error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        حصل خطأ أثناء تحميل الخزنة: {rowsResult.error.message}
      </div>
    );
  }

  const { totalIn, totalOut, balance, countAll, countIn, countOut } = totals;

  // الرصيد الافتتاحي وأول حركة — السطر بتاعه بيقول هو كام وآخر تاريخ ينفع
  const [{ data: opening }, { data: firstMove }] = await Promise.all([
    supabase
      .from("cash_transactions")
      .select("amount, transaction_date")
      .eq("tenant_id", user.tenantId)
      .eq("source_type", OPENING)
      .maybeSingle(),
    supabase
      .from("cash_transactions")
      .select("transaction_date")
      .eq("tenant_id", user.tenantId)
      .neq("source_type", OPENING)
      .order("transaction_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const openingMax = latestOpeningDate(firstMove?.transaction_date as string | undefined);

  const transactions = rowsResult.data;

  // الحركات اللي اتلغت — مالهاش تعديل ولا إلغاء تاني (MONEY ٦.٢)
  const shownIds = transactions.map((t) => t.id);
  const { data: reversals } = shownIds.length
    ? await allRows(supabase.from("cash_transactions").select("reversal_of").in("reversal_of", shownIds))
    : { data: [] };
  const reversedIds = new Set((reversals ?? []).map((r) => r.reversal_of as string));
  const labelOf = (row: CashRow) =>
    cashRowLabel(row) + (reversedIds.has(row.id) ? " · اتلغت" : "");
  const editable = (row: CashRow) =>
    isAdmin && row.source_type === "manual" && !reversedIds.has(row.id);
  const matching = dir === "in" ? countIn : dir === "out" ? countOut : countAll;

  /**
   * ⚠️ **مع فلتر الاتجاه الرصيد الجاري مايتعرضش.** الحساب من فوق لتحت
   * محتاج كل الحركات من غير فجوات — والفلتر بيشيل نصها، فالرقم هيطلع غلط.
   */
  const showBalance = !dir;
  const ledger: ((typeof transactions)[number] & {
    balanceAfter: number | undefined;
  })[] = showBalance
    ? withRunningBalance(transactions, balance)
    : transactions.map((row) => ({ ...row, balanceAfter: undefined }));
  const days = groupByDay(ledger, matching > transactions.length);

  // سطر المجموع — بإشارة مع اللون، مش بداله
  const summary =
    dir === "in"
      ? `${moves(countIn)} داخلة · +${formatMoney(totalIn)}`
      : dir === "out"
        ? `${moves(countOut)} خارجة · −${formatMoney(totalOut)}`
        : `${moves(countAll)} · صافي ${balance < 0 ? "−" : "+"}${formatMoney(Math.abs(balance))}`;

  return (
    <div className="space-y-4">
      {/* الرصيد فوق في الصفحة الأم — هنا الداخل والخارج بس */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-card bg-surface p-5 shadow-card">
          <p className="text-sm text-ink-muted">إجمالي الداخل</p>
          <p className="mt-1 text-2xl font-bold text-success">
            {formatMoney(totalIn)}
          </p>
        </div>
        <div className="rounded-card bg-surface p-5 shadow-card">
          <p className="text-sm text-ink-muted">إجمالي الخارج</p>
          <p className="mt-1 text-2xl font-bold text-danger">
            {formatMoney(totalOut)}
          </p>
        </div>
      </div>

      {actionError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          {saved === "opening" ? "اتحفظ الرصيد الافتتاحي" : "تم حفظ الحركة في الخزنة"}
        </div>
      )}
      {deleted && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          اتلغت الحركة بحركة عكسية
        </div>
      )}

      {/* مقفول ورا «+ حركة» — بنفس شكل «+ مصروف» */}
      {isAdmin && (
        <details id="new-move" className="group rounded-card bg-surface shadow-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-control bg-primary text-white transition-transform group-open:rotate-45"
            >
              +
            </span>
            حركة
          </summary>
        <form
          action={addCashTransaction}
          className="flex flex-wrap items-end gap-3 border-t border-line p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="direction" className="text-xs text-ink-muted">
              النوع
            </label>
            <select
              id="direction"
              name="direction"
              required
              defaultValue=""
              className="w-32 rounded-control border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            >
              <option value="" disabled>
                اختار
              </option>
              <option value="in">إيداع (فلوس داخلة)</option>
              <option value="out">سحب (فلوس خارجة)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="amount" className="text-xs text-ink-muted">
              المبلغ (جنيه)
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="w-28 rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="description" className="text-xs text-ink-muted">
              الوصف (زي: إيداع شريك، سحب أرباح...)
            </label>
            <input
              id="description"
              name="description"
              className="rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="transaction_date" className="text-xs text-ink-muted">
              التاريخ
            </label>
            <input
              id="transaction_date"
              name="transaction_date"
              type="date"
              defaultValue={cairoToday()}
              required
              className="rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>
          <SubmitOnce className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
            تسجيل
          </SubmitOnce>
        </form>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="الاتجاه"
          className="flex gap-1 rounded-control bg-sunken p-1"
        >
          {DIRECTIONS.map((d) => (
            <Link
              key={d.key}
              href={d.key ? `/cash?tab=moves&dir=${d.key}` : "/cash?tab=moves"}
              aria-current={dir === d.key ? "true" : undefined}
              className={`rounded-control px-3 py-1 text-xs font-medium ${
                dir === d.key
                  ? "bg-surface text-ink shadow-card"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {d.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-ink-muted">{summary}</span>
          {can(user, "finance.export") && (
            <a
              href={`/export?what=cash${dir ? `&dir=${dir}` : ""}`}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-body hover:bg-sunken"
            >
              تنزيل Excel
            </a>
          )}
        </div>
      </div>

      {/*
        الرصيد الافتتاحي (MONEY §٦.٤) — سطر صغير مش حركة. بيتعدّل في مكانه،
        وتاريخه لازم يكون قبل أول حركة (`lib/cash-opening.ts`).
      */}
      {!dir && (opening || isAdmin) && (
        <details className="group rounded-card bg-surface text-xs shadow-card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-ink-muted [&::-webkit-details-marker]:hidden">
            {opening ? (
              <>
                <span>{OPENING_LABEL}</span>
                <b className="tabular-nums text-ink">{formatMoney(Number(opening.amount))}</b>
                <span>· {formatDate(opening.transaction_date as string)}</span>
                {isAdmin && <span className="ms-auto text-primary group-open:hidden">تعديل</span>}
              </>
            ) : (
              <>
                <span>مفيش {OPENING_LABEL} — لو الخزنة بدأت بفلوس قبل أول حركة، سجّلها هنا</span>
                <span className="ms-auto text-primary group-open:hidden">تسجيل</span>
              </>
            )}
          </summary>
          {isAdmin && (
            <form
              action={setOpeningBalance}
              className="flex flex-wrap items-end gap-3 border-t border-line p-4"
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="opening_amount" className="text-ink-muted">
                  المبلغ (جنيه)
                </label>
                <input
                  id="opening_amount"
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={opening ? Number(opening.amount) : undefined}
                  className="w-28 rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="opening_date" className="text-ink-muted">
                  التاريخ{openingMax ? ` (قبل ${formatDate(firstMove!.transaction_date as string)})` : ""}
                </label>
                <input
                  id="opening_date"
                  name="transaction_date"
                  type="date"
                  required
                  max={openingMax ?? undefined}
                  defaultValue={
                    opening
                      ? String(opening.transaction_date).slice(0, 10)
                      : (openingMax ?? cairoToday())
                  }
                  className="rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>
              <SubmitOnce className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
                حفظ
              </SubmitOnce>
              {opening && (
                <p className="w-full text-ink-faint">
                  التعديل بيغيّر الرصيد من أوله، وبيتسجّل في سجل النشاط بالقيمة القديمة.
                </p>
              )}
            </form>
          )}
        </details>
      )}

      {transactions.length === 0 ? (
        <div className="rounded-card bg-surface p-12 text-center text-ink-muted shadow-card">
          {dir
            ? "مفيش حركات بالاتجاه ده."
            : "لسه مفيش حركة فلوس في الخزنة."}
        </div>
      ) : (
        <>
        {/* ===== موبايل: كروت مجمّعة باليوم ===== */}
        {/* المسافة الكبيرة قبل الأيام اللي ليها عنوان بس — اليوم بحركة واحدة كارت عادي */}
        <div className="space-y-2 md:hidden">
          {days.map((d) => (
            <section key={d.day} className={dayHasHeader(d) ? "pt-2" : ""}>
              {dayHasHeader(d) && <DayHeader day={d} />}
              <div className={`space-y-2 ${dayHasHeader(d) ? "mt-1.5" : ""}`}>
                {d.rows.map((row) => (
                  <CashCard
                    key={row.id}
                    id={row.id}
                    direction={row.direction}
                    amount={row.amount}
                    description={row.description}
                    transactionDate={row.transaction_date}
                    label={labelOf(row)}
                    note={cashSourceNote(row)}
                    balanceAfter={row.balanceAfter}
                    showDate={!dayHasHeader(d)}
                    canEdit={editable(row)}
                    updateAction={updateCashTransaction}
                    deleteAction={deleteCashTransaction}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ===== كمبيوتر: جدول مجمّع باليوم ===== */}
        <div className="hidden overflow-x-auto rounded-card bg-surface shadow-card md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-right text-ink-muted">
                <th className="px-4 py-3 font-medium">الاتجاه</th>
                <th className="px-4 py-3 font-medium">المصدر</th>
                <th className="px-4 py-3 font-medium">المبلغ</th>
                {showBalance && (
                  <th className="px-4 py-3 font-medium">الرصيد بعدها</th>
                )}
                {isAdmin && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            {days.map((d) => (
              <tbody key={d.day}>
                {dayHasHeader(d) && (
                  <tr className="border-b border-line bg-sunken">
                    <td
                      colSpan={3 + (showBalance ? 1 : 0) + (isAdmin ? 1 : 0)}
                      className="px-4 py-2"
                    >
                      <DayHeader day={d} />
                    </td>
                  </tr>
                )}
                {d.rows.map((row) =>
                  editable(row) ? (
                    <CashManualRow
                      key={row.id}
                      row={{
                        id: row.id,
                        direction: row.direction,
                        amount: row.amount,
                        description: row.description,
                        transaction_date: row.transaction_date,
                      }}
                      note={cashSourceNote(row)}
                      balanceAfter={row.balanceAfter}
                      showDate={false}
                      dateInline={!dayHasHeader(d)}
                      updateAction={updateCashTransaction}
                      deleteAction={deleteCashTransaction}
                    />
                  ) : (
                    <tr
                      key={row.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-4 py-3">
                        {row.direction === "in" ? (
                          <span className="inline-block rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
                            داخل
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
                            خارج
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-body">
                        {labelOf(row)}
                        {(!dayHasHeader(d) || cashSourceNote(row)) && (
                          <div className="text-[11px] text-ink-faint">
                            {[
                              !dayHasHeader(d) ? formatDate(row.transaction_date) : null,
                              cashSourceNote(row),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          row.direction === "in"
                            ? "text-success"
                            : "text-danger"
                        }`}
                      >
                        {formatMoney(row.amount)}
                      </td>
                      {row.balanceAfter !== undefined && (
                        <td className="px-4 py-3 tabular-nums text-ink-muted">
                          {formatMoney(row.balanceAfter)}
                        </td>
                      )}
                      {isAdmin && <td className="px-4 py-3"></td>}
                    </tr>
                  )
                )}
              </tbody>
            ))}
          </table>
        </div>
        <ShowMore
          basePath="/cash"
          query={{ tab: "moves", dir: dir || undefined }}
          shown={transactions.length}
          total={matching}
          step={CASH_STEP}
        />
        </>
      )}
    </div>
  );
}

/** عنوان اليوم: التاريخ ومجموع داخله وخارجه */
function DayHeader({ day }: { day: LedgerDay<unknown> }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
      <span className="font-bold text-ink">
        {formatDate(day.day)}
        {day.partial && (
          <span className="ms-1.5 font-normal text-ink-faint">
            (جزء من اليوم — الباقي تحت «عرض المزيد»)
          </span>
        )}
      </span>
      <span className="tabular-nums text-ink-muted">
        {day.totalIn > 0 && <>+{formatMoney(day.totalIn)}</>}
        {day.totalIn > 0 && day.totalOut > 0 && " · "}
        {day.totalOut > 0 && <>−{formatMoney(day.totalOut)}</>}
      </span>
    </div>
  );
}

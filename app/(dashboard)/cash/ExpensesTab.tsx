import { PeriodFilter } from "@/components/PeriodFilter";
import { FilterBar } from "@/components/FilterBar";
import { FilterSelect } from "@/components/FilterSelect";
import { periodHref, previousPeriod, resolvePeriod } from "@/lib/periods";
import { SupplierField } from "@/components/SupplierField";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CategoryPicker } from "@/components/CategoryPicker";
import {
  EXPENSE_CATEGORIES,
  cairoToday,
  formatDate,
  formatMoney,
} from "@/lib/format";
import { ExpenseRow } from "@/components/ExpenseRow";
import { ExpenseCard } from "@/components/ExpenseCard";
import { can, type SessionUser } from "@/lib/permissions";
import { SubmitOnce } from "@/components/SubmitOnce";
import { addExpense, deleteExpense, updateExpense } from "../expenses/actions";
import { dayHasHeader, groupByDay } from "@/lib/cash-ledger";
import { ShowMore } from "@/components/ShowMore";
import { resolveShowCount } from "@/lib/show-more";
import { allRows } from "@/lib/fetch-all-pages";

type ExpenseRow = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  supplier_id: string | null;
};

// الأنواع الجاهزة بتظهر لأول مرة بس. بعد كده القايمة بتتكوّن من اللي
// استخدمته فعلاً — أي نوع جديد تكتبه بيتضاف لوحده.
const STARTER_CATEGORIES = EXPENSE_CATEGORIES;

/** تاب «المصاريف» — كان صفحة `/expenses` لوحده، ودلوقتي بيتحوّل على هنا */
export async function ExpensesTab({
  params,
  user,
}: {
  user: SessionUser;
  params: {
    error?: string;
    saved?: string;
    deleted?: string;
    cat?: string;
    period?: string;
    from?: string;
    to?: string;
    edit?: string;
    show?: string;
  };
}) {
  const {
    error: actionError,
    saved,
    deleted,
    cat: rawCat,
    period: rawPeriod,
    from: rawFrom,
    to: rawTo,
    show,
  } = params;
  const cat = (rawCat ?? "").trim() || undefined;

  const isAdmin = can(user, "expenses.edit");
  const canExport = can(user, "finance.export");
  const supabase = await createClient();

  const today = cairoToday();
  // ⚠️ **الفترة من `lib/periods`** — مصدر واحد لكل الصفحات (المرحلة ٢).
  // الافتراضي آخر ٣٠ يوم، و«كل الوقت» متاحة عشان دي قايمة.
  const range = resolvePeriod(
    { period: rawPeriod, from: rawFrom, to: rawTo },
    { today, defaultKey: "30d", allowAll: true }
  );
  const periodStart = range.start;
  // الفترة في اللينكات — عشان فلتر النوع مايضيّعهاش
  const periodParams: Record<string, string> =
    range.key === "custom" && range.from && range.to
      ? { from: range.from, to: range.to }
      : range.key !== "30d"
        ? { period: range.key }
        : {};

  let query = supabase
    .from("expenses")
    .select("id, category, description, amount, expense_date, supplier_id")
    .order("expense_date", { ascending: false });
  if (periodStart) query = query.gte("expense_date", periodStart);
  if (range.key === "custom") query = query.lte("expense_date", range.end);
  if (cat) query = query.eq("category", cat);

  // ⚠️ كل مصاريف الفترة — الإجمالي فوق محسوب منها (NEXT §٣٣)
  const { data: expenses, error } = await allRows(query.overrideTypes<ExpenseRow[]>());

  // نفس الفلتر على الفترة اللي قبلها بنفس الطول — عشان الرقم يبقى ليه معنى
  const prev = previousPeriod(range);
  let prevTotal: number | null = null;
  if (prev) {
    let pq = supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", prev.start)
      .lte("expense_date", prev.end);
    if (cat) pq = pq.eq("category", cat);
    const { data: prevRows, error: prevError } = await allRows(pq);
    // ⚠️ فشل المقارنة مايوقعش الصفحة — بس مانعرضش رقم من غير أساس
    if (!prevError) {
      prevTotal = (prevRows ?? []).reduce((t, r) => t + Number(r.amount), 0);
    }
  }

  // الأنواع اللي استخدمتها فعلاً + الجاهزة، من غير تكرار
  const { data: usedCats } = await allRows(supabase
    .from("expenses")
    .select("category")
    .overrideTypes<{ category: string }[]>());
  const CATEGORY_SUGGESTIONS = Array.from(
    new Set([
      ...(usedCats ?? []).map((r) => r.category).filter(Boolean),
      ...STARTER_CATEGORIES,
    ]),
  );

  // أسماء الموردين بتتقري بمفتاح الأدمن (جدول الموردين مقفول في الـRLS)
  const { data: supplierRows } = await createAdminClient()
    .from("suppliers")
    .select("id, name")
    // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد المنع
    .eq("tenant_id", user.tenantId)
    .order("name")
    .overrideTypes<{ id: string; name: string }[]>();
  const suppliers = supplierRows ?? [];
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        حصل خطأ أثناء تحميل المصاريف: {error.message}
      </div>
    );
  }

  const shownTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const count = expenses.length;
  const change =
    prev && prevTotal !== null && prevTotal > 0
      ? Math.round(((shownTotal - prevTotal) / prevTotal) * 100)
      : null;

  // ⚠️ **إجمالي الفترة فوق على كل مصاريف الفترة** — القص ده للعرض بس
  const showCount = resolveShowCount(show);
  const visible = expenses.slice(0, showCount);
  // التاريخ في عنوان المجموعة بس (قرار عمر) — مجموع اليوم على المعروض
  const days = groupByDay(
    visible.map((e) => ({
      ...e,
      direction: "out",
      transaction_date: e.expense_date,
    })),
    expenses.length > visible.length
  );

  // لينك نوع المصروف — بيحافظ على الفترة المختارة
  const buildHref = (next: { cat?: string | null }) => {
    const c = next.cat === null ? undefined : (next.cat ?? cat);
    return periodHref(
      "/cash",
      { tab: "expenses", cat: c },
      range.key === "custom" ? { from: range.from!, to: range.to! } : { key: range.key as "7d" | "30d" | "month" | "all" },
      "30d"
    );
  };

  return (
    <div className="space-y-4">
      {/* ⚠️ الرقم الأساسي في التاب — كان رمادي صغير في الركن */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">
            {cat ? `${cat} · ` : ""}
            {range.label}
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink sm:text-3xl">
            {formatMoney(shownTotal)}
            <span className="ms-2 text-sm font-normal text-ink-muted">
              · {count} {count >= 3 && count <= 10 ? "مصاريف" : "مصروف"}
            </span>
          </p>
          {prev && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {change === null
                ? prevTotal === 0
                  ? `مفيش مصاريف في ${prev.label}`
                  : null
                : change === 0
                  ? `زي ${prev.label}`
                  : `${change > 0 ? "↑" : "↓"} ${Math.abs(change)}٪ عن ${prev.label}`}
            </p>
          )}
        </div>
        {/* التنزيل بنفس الفلاتر — اللي شايفه هو اللي بينزل (المحاسب طلب كشف) */}
        {canExport && (
          <a
            href={`/export?${new URLSearchParams({ what: "expenses", ...(cat ? { cat } : {}), ...periodParams })}`}
            className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-body hover:bg-sunken"
          >
            تنزيل Excel
          </a>
        )}
      </div>

      {/* شريط الفلاتر الموحّد — التصنيفات منسدلة (١٣ نوع ماينفعوش شرايح) */}
      <FilterBar
        chips={cat ? [{ label: cat, removeHref: buildHref({ cat: null }) }] : []}
        clearHref={cat || range.key !== "30d" ? "/cash?tab=expenses" : undefined}
      >
        <PeriodFilter
          basePath="/cash"
          query={{ tab: "expenses", cat }}
          current={range}
          defaultKey="30d"
          allowAll
        />
        <FilterSelect
          name="cat"
          value={cat}
          options={CATEGORY_SUGGESTIONS.map((c) => ({ value: c, label: c }))}
          allLabel="كل الأنواع"
          basePath="/cash"
          query={{ tab: "expenses", ...periodParams }}
          label="نوع المصروف"
        />
      </FilterBar>

      {actionError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم الحفظ وتحديث الخزنة
        </div>
      )}
      {deleted && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم مسح المصروف وحركته من الخزنة
        </div>
      )}

      {/*
        ⚠️ الفورم مقفول — كان تلت الصفحة مفتوح دايمًا لحاجة بتتعمل مرة في اليوم.
        الترتيب: المبلغ الأول (الوحيد الإجباري مع النوع) · النوع · الوصف · التاريخ · المورد.
      */}
      {isAdmin && (
        <details
          id="new-expense"
          className="group rounded-card bg-surface shadow-card"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-control bg-primary text-white transition-transform group-open:rotate-45"
            >
              +
            </span>
            مصروف
          </summary>
          <form
            action={addExpense}
            className="flex flex-wrap items-end gap-3 border-t border-line p-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="amount" className="text-xs text-ink-muted">
                المبلغ (جنيه)
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                className="w-28 rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="category" className="text-xs text-ink-muted">
                النوع
              </label>
              <CategoryPicker
                id="category"
                required
                categories={CATEGORY_SUGGESTIONS}
                className="w-40 rounded-control border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>
            {/* على الموبايل الوصف بياخد السطر كله — أعرض من المبلغ */}
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-48 sm:flex-1">
              <label htmlFor="description" className="text-xs text-ink-muted">
                الوصف (اختياري)
              </label>
              <input
                id="description"
                name="description"
                className="rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="expense_date" className="text-xs text-ink-muted">
                التاريخ
              </label>
              <input
                id="expense_date"
                name="expense_date"
                type="date"
                defaultValue={today}
                required
                className="rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>
            {suppliers.length > 0 && (
              <SupplierField
                suppliers={suppliers}
                className="w-40 rounded-control border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
              />
            )}
            <SubmitOnce className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60">
              تسجيل المصروف
            </SubmitOnce>
          </form>
        </details>
      )}

      {expenses.length === 0 ? (
        <div className="rounded-card bg-surface p-12 text-center text-ink-muted shadow-card">
          {cat || range.key !== "all"
            ? "مفيش مصاريف بالفلتر ده."
            : "لسه مفيش مصاريف مسجلة."}
        </div>
      ) : (
        <>
          {/* ===== موبايل: كروت ===== */}
          <div className="space-y-2 md:hidden">
            {days.map((d) => (
              <section key={d.day} className={dayHasHeader(d) ? "pt-2" : ""}>
                {dayHasHeader(d) && (
                  <ExpenseDayHeader day={d.day} total={d.totalOut} partial={d.partial} />
                )}
                <div className={`space-y-2 ${dayHasHeader(d) ? "mt-1.5" : ""}`}>
            {d.rows.map((expense) => (
              <ExpenseCard
                showDate={!dayHasHeader(d)}
                key={expense.id}
                expense={expense}
                categories={CATEGORY_SUGGESTIONS}
                supplier={
                  expense.supplier_id
                    ? (supplierName.get(expense.supplier_id) ?? null)
                    : null
                }
                canEdit={isAdmin}
                updateAction={updateExpense}
                deleteAction={deleteExpense}
              />
            ))}
                </div>
              </section>
            ))}
          </div>

          {/* ===== كمبيوتر: جدول ===== */}
          <div className="hidden overflow-x-auto rounded-card bg-surface shadow-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-right text-ink-muted">
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">الوصف</th>
                  <th className="px-4 py-3 font-medium">المبلغ</th>
                  {isAdmin && <th className="px-4 py-3 font-medium"></th>}
                </tr>
              </thead>
              {days.map((d) => (
              <tbody key={d.day}>
                {dayHasHeader(d) && (
                  <tr className="border-b border-line bg-sunken">
                    <td colSpan={isAdmin ? 4 : 3} className="px-4 py-2">
                      <ExpenseDayHeader day={d.day} total={d.totalOut} partial={d.partial} />
                    </td>
                  </tr>
                )}
                {d.rows.map((expense) =>
                  isAdmin ? (
                    <ExpenseRow
                      key={expense.id}
                      showDate={false}
                      dateInline={!dayHasHeader(d)}
                      expense={expense}
                      categories={CATEGORY_SUGGESTIONS}
                      supplier={
                        expense.supplier_id
                          ? (supplierName.get(expense.supplier_id) ?? null)
                          : null
                      }
                      updateAction={updateExpense}
                      deleteAction={deleteExpense}
                    />
                  ) : (
                    <tr
                      key={expense.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-ink">
                        {expense.category}
                        {!dayHasHeader(d) && (
                          <div className="text-[11px] font-normal text-ink-faint">
                            {formatDate(expense.expense_date)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-body">
                        {expense.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-ink-body">
                        {formatMoney(expense.amount)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
              ))}
            </table>
          </div>
          <ShowMore
            basePath="/cash"
            query={{ tab: "expenses", cat, ...periodParams }}
            shown={visible.length}
            total={expenses.length}
          />
        </>
      )}
    </div>
  );
}

/** عنوان يوم المصاريف: التاريخ ومجموعه */
function ExpenseDayHeader({
  day,
  total,
  partial,
}: {
  day: string;
  total: number;
  partial: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
      <span className="font-bold text-ink">
        {formatDate(day)}
        {partial && (
          <span className="ms-1.5 font-normal text-ink-faint">
            (جزء من اليوم — الباقي تحت «عرض المزيد»)
          </span>
        )}
      </span>
      <span className="tabular-nums text-ink-muted">{formatMoney(total)}</span>
    </div>
  );
}

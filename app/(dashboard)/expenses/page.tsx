import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPENSE_CATEGORIES,
  cairoToday,
  formatDate,
  formatMoney,
} from "@/lib/format";
import { ExpenseRow } from "@/components/ExpenseRow";
import { ExpenseCard } from "@/components/ExpenseCard";
import { can, requirePagePermission } from "@/lib/permissions";
import { addExpense, deleteExpense, updateExpense } from "./actions";

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

const PERIODS: Record<string, string> = {
  month: "الشهر ده",
  "3m": "آخر 3 شهور",
  year: "السنة دي",
  all: "الكل",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    deleted?: string;
    cat?: string;
    period?: string;
    edit?: string;
  }>;
}) {
  const {
    error: actionError,
    saved,
    deleted,
    cat: rawCat,
    period: rawPeriod,
  } = await searchParams;
  const cat = (rawCat ?? "").trim() || undefined;
  const period = PERIODS[rawPeriod ?? ""] ? (rawPeriod as string) : "month";
  const user = await requirePagePermission("expenses.view");
  const isAdmin = can(user, "expenses.edit");
  const supabase = await createClient();

  const today = cairoToday();
  let periodStart: string | null = null;
  if (period === "month") periodStart = today.slice(0, 8) + "01";
  else if (period === "3m") {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 89);
    periodStart = d.toISOString().slice(0, 10);
  } else if (period === "year") periodStart = today.slice(0, 4) + "-01-01";

  let query = supabase
    .from("expenses")
    .select("id, category, description, amount, expense_date, supplier_id")
    .order("expense_date", { ascending: false })
    .limit(2000);
  if (periodStart) query = query.gte("expense_date", periodStart);
  if (cat) query = query.eq("category", cat);

  const { data: expenses, error } = await query.overrideTypes<ExpenseRow[]>();

  // الأنواع اللي استخدمتها فعلاً + الجاهزة، من غير تكرار
  const { data: usedCats } = await supabase
    .from("expenses")
    .select("category")
    .limit(5000)
    .overrideTypes<{ category: string }[]>();
  const CATEGORY_SUGGESTIONS = Array.from(
    new Set([
      ...(usedCats ?? []).map((r) => r.category).filter(Boolean),
      ...STARTER_CATEGORIES,
    ])
  );

  // أسماء الموردين بتتقري بمفتاح الأدمن (جدول الموردين مقفول في الـRLS)
  const { data: supplierRows } = await createAdminClient()
    .from("suppliers")
    .select("id, name")
    .order("name")
    .overrideTypes<{ id: string; name: string }[]>();
  const suppliers = supplierRows ?? [];
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل المصاريف: {error.message}
      </div>
    );
  }

  const shownTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const buildHref = (next: { cat?: string | null; period?: string }) => {
    const params = new URLSearchParams();
    const c = next.cat === null ? undefined : next.cat ?? cat;
    const p = next.period ?? period;
    if (c) params.set("cat", c);
    if (p && p !== "month") params.set("period", p);
    const qs = params.toString();
    return qs ? `/expenses?${qs}` : "/expenses";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">المصاريف</h1>
        <span className="text-sm text-gray-500">
          {cat ? `${cat} — ` : ""}
          {PERIODS[period]}: {formatMoney(shownTotal)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(PERIODS).map(([key, label]) => (
          <Link
            key={key}
            href={buildHref({ period: key })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              period === key
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-300"></span>
        <Link
          href={buildHref({ cat: null })}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !cat
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
          }`}
        >
          كل الأنواع
        </Link>
        {CATEGORY_SUGGESTIONS.map((c) => (
          <Link
            key={c}
            href={buildHref({ cat: c })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              cat === c
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
            }`}
          >
            {c}
          </Link>
        ))}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم الحفظ وتحديث الخزنة
        </div>
      )}
      {deleted && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم مسح المصروف وحركته من الخزنة
        </div>
      )}

      {isAdmin && (
        <form
          action={addExpense}
          className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-xs text-gray-500">
              النوع
            </label>
            <input
              id="category"
              name="category"
              list="expense-categories"
              required
              autoComplete="off"
              placeholder="اختار أو اكتب نوع جديد"
              className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
            <datalist id="expense-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="description" className="text-xs text-gray-500">
              الوصف (اختياري)
            </label>
            <input
              id="description"
              name="description"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="amount" className="text-xs text-gray-500">
              المبلغ (جنيه)
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="expense_date" className="text-xs text-gray-500">
              التاريخ
            </label>
            <input
              id="expense_date"
              name="expense_date"
              type="date"
              defaultValue={today}
              required
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          {suppliers.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier_id" className="text-xs text-gray-500">
                المورد (اختياري)
              </label>
              <select
                id="supplier_id"
                name="supplier_id"
                defaultValue=""
                className="w-40 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              >
                <option value="">مش على مورد</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            تسجيل المصروف
          </button>
          <p className="w-full text-xs text-gray-400">
            لو اخترت مورد، المصروف ده بيتسجّل دفعة في حسابه وبيقلّل اللي عليك له.
            فواتير البضاعة بالأجل بتتسجّل من صفحة المورد نفسه ومابتتحسبش مصروف
            غير لما تحاسبه.
          </p>
        </form>
      )}

      {expenses.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          {cat || period !== "all"
            ? "مفيش مصاريف بالفلتر ده."
            : "لسه مفيش مصاريف مسجلة."}
        </div>
      ) : (
        <>
        {/* ===== موبايل: كروت ===== */}
        <div className="space-y-2 md:hidden">
          {expenses.map((expense) => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              categories={CATEGORY_SUGGESTIONS}
              supplier={
                expense.supplier_id
                  ? supplierName.get(expense.supplier_id) ?? null
                  : null
              }
              canEdit={isAdmin}
              updateAction={updateExpense}
              deleteAction={deleteExpense}
            />
          ))}
        </div>

        {/* ===== كمبيوتر: جدول ===== */}
        <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">النوع</th>
                <th className="px-4 py-3 font-medium">الوصف</th>
                <th className="px-4 py-3 font-medium">المبلغ</th>
                {isAdmin && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) =>
                isAdmin ? (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    categories={CATEGORY_SUGGESTIONS}
                    supplier={
                      expense.supplier_id
                        ? supplierName.get(expense.supplier_id) ?? null
                        : null
                    }
                    updateAction={updateExpense}
                    deleteAction={deleteExpense}
                  />
                ) : (
                  <tr
                    key={expense.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(expense.expense_date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {expense.category}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {expense.description ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(expense.amount)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

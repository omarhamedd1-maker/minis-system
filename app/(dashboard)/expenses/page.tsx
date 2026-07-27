import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cairoToday, formatDate, formatMoney } from "@/lib/format";
import { ExpenseRow } from "@/components/ExpenseRow";
import { ConfirmButton } from "@/components/ConfirmButton";
import { can, requirePagePermission } from "@/lib/permissions";
import { addExpense, deleteExpense, updateExpense } from "./actions";

type ExpenseRow = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
};

const CATEGORY_SUGGESTIONS = [
  "إعلانات",
  "شحن",
  "تغليف",
  "تصنيع وخامات",
  "مواصلات",
  "اشتراكات",
  "مرتجعات",
  "أخرى",
];

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
    edit: editId,
  } = await searchParams;
  const cat = CATEGORY_SUGGESTIONS.includes(rawCat ?? "") ? rawCat : undefined;
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
    .select("id, category, description, amount, expense_date")
    .order("expense_date", { ascending: false })
    .limit(2000);
  if (periodStart) query = query.gte("expense_date", periodStart);
  if (cat) query = query.eq("category", cat);

  const { data: expenses, error } = await query.overrideTypes<ExpenseRow[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل المصاريف: {error.message}
      </div>
    );
  }

  const shownTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const buildHref = (next: { cat?: string | null; period?: string; edit?: string }) => {
    const params = new URLSearchParams();
    const c = next.cat === null ? undefined : next.cat ?? cat;
    const p = next.period ?? period;
    if (c) params.set("cat", c);
    if (p && p !== "month") params.set("period", p);
    if (next.edit) params.set("edit", next.edit);
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
            <select
              id="category"
              name="category"
              required
              defaultValue=""
              className="w-36 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            >
              <option value="" disabled>
                اختار النوع
              </option>
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            تسجيل المصروف
          </button>
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
        {/* ===== موبايل: كروت والأزرار ظاهرة ===== */}
        <div className="space-y-2 md:hidden">
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-900">
                    {expense.category}
                  </div>
                  {expense.description && (
                    <div className="mt-0.5 text-xs text-gray-600">
                      {expense.description}
                    </div>
                  )}
                  <div className="mt-0.5 text-xs text-gray-400">
                    {formatDate(expense.expense_date)}
                  </div>
                </div>
                <div className="shrink-0 text-base font-bold text-red-700">
                  {formatMoney(expense.amount)}
                </div>
              </div>
              {isAdmin && (
                <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
                  <Link
                    href={buildHref({ edit: expense.id })}
                    className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white"
                  >
                    تعديل
                  </Link>
                  <form action={deleteExpense}>
                    <input type="hidden" name="expense_id" value={expense.id} />
                    <ConfirmButton
                      message="متأكد إنك عايز تمسح المصروف ده؟"
                      className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                    >
                      مسح
                    </ConfirmButton>
                  </form>
                </div>
              )}
              {isAdmin && editId === expense.id && (
                <form
                  action={updateExpense}
                  className="minis-in mt-2 space-y-2 border-t border-gray-100 pt-2"
                >
                  <input type="hidden" name="expense_id" value={expense.id} />
                  <div className="flex gap-2">
                    <select
                      name="category"
                      defaultValue={expense.category}
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      aria-label="النوع"
                    >
                      {CATEGORY_SUGGESTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      name="amount"
                      defaultValue={expense.amount}
                      min="0.01"
                      step="0.01"
                      className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      aria-label="المبلغ"
                    />
                  </div>
                  <input
                    name="description"
                    defaultValue={expense.description ?? ""}
                    placeholder="الوصف"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="date"
                    name="expense_date"
                    defaultValue={expense.expense_date}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    aria-label="التاريخ"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      حفظ
                    </button>
                    <Link
                      href={buildHref({})}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700"
                    >
                      إلغاء
                    </Link>
                  </div>
                </form>
              )}
            </div>
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

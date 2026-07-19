import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cairoToday, formatDate, formatMoney } from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
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
  }>;
}) {
  const {
    error: actionError,
    saved,
    deleted,
    cat: rawCat,
    period: rawPeriod,
  } = await searchParams;
  const cat = CATEGORY_SUGGESTIONS.includes(rawCat ?? "") ? rawCat : undefined;
  const period = PERIODS[rawPeriod ?? ""] ? (rawPeriod as string) : "month";
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");

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
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
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
                  <tr
                    key={expense.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <form
                        id={`expense-${expense.id}`}
                        action={updateExpense}
                      >
                        <input
                          type="hidden"
                          name="expense_id"
                          value={expense.id}
                        />
                      </form>
                      <input
                        type="date"
                        name="expense_date"
                        form={`expense-${expense.id}`}
                        defaultValue={expense.expense_date}
                        required
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        name="category"
                        form={`expense-${expense.id}`}
                        defaultValue={expense.category}
                        required
                        className="w-32 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      >
                        {CATEGORY_SUGGESTIONS.includes(expense.category) || (
                          <option value={expense.category}>
                            {expense.category}
                          </option>
                        )}
                        {CATEGORY_SUGGESTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        name="description"
                        form={`expense-${expense.id}`}
                        defaultValue={expense.description ?? ""}
                        className="w-full min-w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        name="amount"
                        form={`expense-${expense.id}`}
                        defaultValue={expense.amount}
                        min="0.01"
                        step="0.01"
                        required
                        className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          form={`expense-${expense.id}`}
                          className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                        >
                          حفظ
                        </button>
                        <form action={deleteExpense}>
                          <input
                            type="hidden"
                            name="expense_id"
                            value={expense.id}
                          />
                          <ConfirmButton
                            message="متأكد إنك عايز تمسح المصروف ده؟ هيتشال من الخزنة كمان."
                            className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            مسح
                          </ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </tr>
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
      )}
    </div>
  );
}

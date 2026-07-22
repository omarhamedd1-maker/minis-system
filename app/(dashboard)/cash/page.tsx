import { createClient } from "@/lib/supabase/server";
import { cairoToday, formatDate, formatMoney } from "@/lib/format";
import { CashManualRow } from "@/components/CashManualRow";
import { can, requirePagePermission } from "@/lib/permissions";
import {
  addCashTransaction,
  deleteCashTransaction,
  updateCashTransaction,
} from "./actions";

type CashRow = {
  id: string;
  direction: string;
  amount: number;
  source_type: string | null;
  description: string | null;
  transaction_date: string | null;
  orders: { order_number: string | null } | null;
  expenses: { category: string | null; description: string | null } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  expense: "مصروف",
  order: "أوردر",
};

function sourceLabel(row: CashRow) {
  if (row.source_type === "manual") {
    const base = row.direction === "in" ? "إيداع يدوي" : "سحب يدوي";
    return row.description ? `${base}: ${row.description}` : base;
  }
  const base = SOURCE_LABELS[row.source_type ?? ""] ?? row.source_type ?? "—";
  if (row.expenses) {
    return `${base}: ${row.expenses.category ?? ""}${
      row.expenses.description ? ` (${row.expenses.description})` : ""
    }`;
  }
  if (row.orders?.order_number) {
    return `${base} رقم ${row.orders.order_number}`;
  }
  return base;
}

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string }>;
}) {
  const { error: actionError, saved, deleted } = await searchParams;
  const user = await requirePagePermission("cash.view");
  const isAdmin = can(user, "cash.edit");
  const supabase = await createClient();

  const [totalsResult, rowsResult] = await Promise.all([
    supabase
      .from("cash_transactions")
      .select("direction, amount")
      .overrideTypes<{ direction: string; amount: number }[]>(),
    supabase
      .from("cash_transactions")
      .select(
        "id, direction, amount, source_type, description, transaction_date, orders(order_number), expenses(category, description)"
      )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100)
      .overrideTypes<CashRow[]>(),
  ]);

  if (totalsResult.error || rowsResult.error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل الخزنة:{" "}
        {totalsResult.error?.message ?? rowsResult.error?.message}
      </div>
    );
  }

  const totalIn = totalsResult.data
    .filter((t) => t.direction === "in")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalOut = totalsResult.data
    .filter((t) => t.direction === "out")
    .reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIn - totalOut;

  const transactions = rowsResult.data;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">الخزنة</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">الرصيد الحالي</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              balance >= 0 ? "text-gray-900" : "text-red-600"
            }`}
          >
            {formatMoney(balance)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">إجمالي الداخل</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatMoney(totalIn)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">إجمالي الخارج</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {formatMoney(totalOut)}
          </p>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم حفظ الحركة في الخزنة
        </div>
      )}
      {deleted && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم مسح الحركة من الخزنة
        </div>
      )}

      {isAdmin && (
        <form
          action={addCashTransaction}
          className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="direction" className="text-xs text-gray-500">
              النوع
            </label>
            <select
              id="direction"
              name="direction"
              required
              defaultValue=""
              className="w-32 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            >
              <option value="" disabled>
                اختار
              </option>
              <option value="in">إيداع (فلوس داخلة)</option>
              <option value="out">سحب (فلوس خارجة)</option>
            </select>
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
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="description" className="text-xs text-gray-500">
              الوصف (زي: إيداع شريك، سحب أرباح...)
            </label>
            <input
              id="description"
              name="description"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="transaction_date" className="text-xs text-gray-500">
              التاريخ
            </label>
            <input
              id="transaction_date"
              name="transaction_date"
              type="date"
              defaultValue={cairoToday()}
              required
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            تسجيل
          </button>
        </form>
      )}

      {transactions.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          لسه مفيش حركة فلوس في الخزنة.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">الاتجاه</th>
                <th className="px-4 py-3 font-medium">المصدر</th>
                <th className="px-4 py-3 font-medium">المبلغ</th>
                {isAdmin && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {transactions.map((row) =>
                isAdmin && row.source_type === "manual" ? (
                  <CashManualRow
                    key={row.id}
                    row={{
                      id: row.id,
                      direction: row.direction,
                      amount: row.amount,
                      description: row.description,
                      transaction_date: row.transaction_date,
                    }}
                    updateAction={updateCashTransaction}
                    deleteAction={deleteCashTransaction}
                  />
                ) : (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(row.transaction_date)}
                    </td>
                    <td className="px-4 py-3">
                      {row.direction === "in" ? (
                        <span className="inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          داخل
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          خارج
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {sourceLabel(row)}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        row.direction === "in"
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatMoney(row.amount)}
                    </td>
                    {isAdmin && <td className="px-4 py-3"></td>}
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

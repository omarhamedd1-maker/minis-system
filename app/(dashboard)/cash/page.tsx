import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";

type CashRow = {
  id: string;
  direction: string;
  amount: number;
  source_type: string | null;
  transaction_date: string | null;
  orders: { order_number: string | null } | null;
  expenses: { category: string | null; description: string | null } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  expense: "مصروف",
  order: "أوردر",
  manual: "يدوي",
};

function sourceLabel(row: CashRow) {
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

export default async function CashPage() {
  const supabase = await createClient();

  const [totalsResult, rowsResult] = await Promise.all([
    supabase
      .from("cash_transactions")
      .select("direction, amount")
      .overrideTypes<{ direction: string; amount: number }[]>(),
    supabase
      .from("cash_transactions")
      .select(
        "id, direction, amount, source_type, transaction_date, orders(order_number), expenses(category, description)"
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
              </tr>
            </thead>
            <tbody>
              {transactions.map((row) => (
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
                  <td className="px-4 py-3 text-gray-700">{sourceLabel(row)}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      row.direction === "in" ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {formatMoney(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

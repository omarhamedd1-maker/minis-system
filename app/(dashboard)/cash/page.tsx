import { createClient } from "@/lib/supabase/server";
import { cairoToday, formatDate, formatMoney } from "@/lib/format";
import { CashManualRow } from "@/components/CashManualRow";
import { CashCard } from "@/components/CashCard";
import { can, requirePagePermission } from "@/lib/permissions";
import { SubmitOnce } from "@/components/SubmitOnce";
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
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
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
      <h1 className="text-xl font-bold text-ink">الخزنة</h1>

      {/* الرصيد بالعرض فوق، والداخل والخارج تحته اتنين جنب بعض */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="col-span-2 rounded-card bg-surface p-4 shadow-card sm:p-5 lg:col-span-1">
          <p className="text-sm text-ink-muted">الرصيد الحالي</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              balance >= 0 ? "text-ink" : "text-danger"
            }`}
          >
            {formatMoney(balance)}
          </p>
        </div>
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
          تم حفظ الحركة في الخزنة
        </div>
      )}
      {deleted && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم مسح الحركة من الخزنة
        </div>
      )}

      {isAdmin && (
        <form
          action={addCashTransaction}
          className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-4 shadow-card"
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
      )}

      {transactions.length === 0 ? (
        <div className="rounded-card bg-surface p-12 text-center text-ink-muted shadow-card">
          لسه مفيش حركة فلوس في الخزنة.
        </div>
      ) : (
        <>
        {/* ===== موبايل: كروت ===== */}
        <div className="space-y-2 md:hidden">
          {transactions.map((row) => (
            <CashCard
              key={row.id}
              id={row.id}
              direction={row.direction}
              amount={row.amount}
              description={row.description}
              transactionDate={row.transaction_date}
              label={sourceLabel(row)}
              canEdit={isAdmin && row.source_type === "manual"}
              updateAction={updateCashTransaction}
              deleteAction={deleteCashTransaction}
            />
          ))}
        </div>

        {/* ===== كمبيوتر: جدول ===== */}
        <div className="hidden overflow-x-auto rounded-card bg-surface shadow-card md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-right text-ink-muted">
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
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3 text-ink-body">
                      {formatDate(row.transaction_date)}
                    </td>
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
                      {sourceLabel(row)}
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
                    {isAdmin && <td className="px-4 py-3"></td>}
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

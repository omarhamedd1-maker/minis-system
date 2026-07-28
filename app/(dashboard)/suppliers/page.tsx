import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { AddSupplier } from "@/components/AddSupplier";
import { can, requirePagePermission } from "@/lib/permissions";
import { addSupplier } from "./actions";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  supplier_transactions: { kind: string; amount: number }[];
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: actionError } = await searchParams;
  const user = await requirePagePermission("suppliers.view");
  const canEdit = can(user, "suppliers.edit");
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("suppliers")
    .select("id, name, phone, notes, supplier_transactions(kind, amount)")
    .order("name")
    .overrideTypes<Supplier[]>();

  // الجداول لسه ماتعملتش في الداتابيز
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">الموردين</h1>
        <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">الصفحة محتاجة جدولين في الداتابيز الأول.</p>
          <p className="mt-1">
            افتح Supabase → SQL Editor وشغّل السكريبت اللي في الشات، وبعدها افتح
            الصفحة دي تاني.
          </p>
          <p className="mt-2 text-xs text-amber-700">({error.message})</p>
        </div>
      </div>
    );
  }

  const suppliers = (data ?? []).map((s) => {
    const purchases = s.supplier_transactions
      .filter((t) => t.kind === "purchase")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const payments = s.supplier_transactions
      .filter((t) => t.kind === "payment")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return { ...s, purchases, payments, balance: purchases - payments };
  });

  // اللي عليه فلوس الأول
  suppliers.sort((a, b) => b.balance - a.balance);

  const totalDue = suppliers.reduce((s, x) => s + Math.max(x.balance, 0), 0);
  const totalPurchases = suppliers.reduce((s, x) => s + x.purchases, 0);
  const totalPayments = suppliers.reduce((s, x) => s + x.payments, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">الموردين</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{suppliers.length} مورد</span>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="col-span-2 rounded-xl bg-white p-4 shadow-sm sm:p-5 lg:col-span-1">
          <p className="text-xs text-gray-500 sm:text-sm">اللي عليك للموردين</p>
          <p
            className={`mt-1 text-xl font-bold sm:text-2xl lg:text-4xl ${
              totalDue > 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            {formatMoney(totalDue)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs text-gray-500 sm:text-sm">إجمالي الفواتير</p>
          <p className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
            {formatMoney(totalPurchases)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs text-gray-500 sm:text-sm">إجمالي المدفوع</p>
          <p className="mt-1 text-xl font-bold text-green-600 sm:text-2xl">
            {formatMoney(totalPayments)}
          </p>
        </div>
      </div>

      {canEdit && <AddSupplier action={addSupplier} />}

      {suppliers.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          لسه مفيش موردين — ضيف أول واحد من فوق.
        </div>
      ) : (
        <>
          {/* ===== موبايل: كروت ===== */}
          <div className="space-y-2 md:hidden">
            {suppliers.map((s) => (
              <Link
                key={s.id}
                href={`/suppliers/${s.id}`}
                className="block rounded-xl bg-white p-3 shadow-sm transition-colors active:bg-gray-50"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">
                      {s.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {s.phone || "بدون تليفون"}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div
                      className={`text-base font-bold ${
                        s.balance > 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {s.balance > 0 ? formatMoney(s.balance) : "متسوّي"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      فواتير {formatMoney(s.purchases)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* ===== كمبيوتر: جدول ===== */}
          <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-right text-gray-500">
                  <th className="px-4 py-3 font-medium">المورد</th>
                  <th className="px-4 py-3 font-medium">التليفون</th>
                  <th className="px-4 py-3 font-medium">الفواتير</th>
                  <th className="px-4 py-3 font-medium">المدفوع</th>
                  <th className="px-4 py-3 font-medium">اللي عليك</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/suppliers/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(s.purchases)}
                    </td>
                    <td className="px-4 py-3 text-green-700">
                      {formatMoney(s.payments)}
                    </td>
                    <td
                      className={`px-4 py-3 font-bold ${
                        s.balance > 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {s.balance > 0 ? formatMoney(s.balance) : "متسوّي"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-gray-400">
        الفاتورة = بضاعة استلمتها من المورد — بتتسجل مصروف في صفحة المصاريف
        وبتزوّد اللي عليك له، والخزنة مابتتأثرش لأن الفلوس لسه ماطلعتش. الدفعة =
        فلوس طلعت فعلاً، فبتتخصم من الخزنة وبتقلّل اللي عليك.
      </p>
    </div>
  );
}

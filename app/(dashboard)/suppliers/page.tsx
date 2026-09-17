import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { AddSupplier } from "@/components/AddSupplier";
import { can, requirePagePermission } from "@/lib/permissions";
import { addSupplier } from "./actions";
import { ShowMore } from "@/components/ShowMore";
import { resolveShowCount } from "@/lib/show-more";
import { allRows } from "@/lib/fetch-all-pages";

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
  searchParams: Promise<{ error?: string; show?: string }>;
}) {
  const { error: actionError, show } = await searchParams;
  const user = await requirePagePermission("suppliers.view");
  const canEdit = can(user, "suppliers.edit");
  const admin = createAdminClient();

  const { data, error } = await allRows(admin
    .from("suppliers")
    .select("id, name, phone, notes, supplier_transactions(kind, amount)")
    // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد المنع
    .eq("tenant_id", user.tenantId)
    .order("name")
    .overrideTypes<Supplier[]>());

  // الجداول لسه ماتعملتش في الداتابيز
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-ink">الموردين</h1>
        <div className="rounded-card bg-warning-soft p-5 text-sm text-warning">
          <p className="font-bold">الصفحة محتاجة جدولين في الداتابيز الأول.</p>
          <p className="mt-1">
            افتح Supabase → SQL Editor وشغّل السكريبت اللي في الشات، وبعدها افتح
            الصفحة دي تاني.
          </p>
          <p className="mt-2 text-xs text-warning">({error.message})</p>
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

  // ⚠️ **الإجماليات فوق على القايمة الكاملة** — القص ده للعرض بس
  const showCount = resolveShowCount(show);
  const visible = suppliers.slice(0, showCount);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-ink">الموردين</h1>
        {canEdit && <AddSupplier action={addSupplier} />}
        <span className="ms-auto text-sm text-ink-muted">
          {suppliers.length} مورد
        </span>
      </div>

      {actionError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="card col-span-2 p-4 sm:p-5 lg:col-span-1">
          <p className="text-xs text-ink-muted sm:text-sm">اللي عليك للموردين</p>
          <p
            className={`mt-1 text-xl font-bold sm:text-2xl lg:text-4xl ${
              totalDue > 0 ? "text-danger" : "text-success"
            }`}
          >
            {formatMoney(totalDue)}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-xs text-ink-muted sm:text-sm">إجمالي الفواتير</p>
          <p className="mt-1 text-xl font-bold text-ink sm:text-2xl">
            {formatMoney(totalPurchases)}
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <p className="text-xs text-ink-muted sm:text-sm">إجمالي المدفوع</p>
          <p className="mt-1 text-xl font-bold text-success sm:text-2xl">
            {formatMoney(totalPayments)}
          </p>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="card empty p-12">
          لسه مفيش موردين — ضيف أول واحد من فوق.
        </div>
      ) : (
        <>
          {/* ===== موبايل: كروت ===== */}
          <div className="space-y-2 md:hidden">
            {visible.map((s) => (
              <Link
                key={s.id}
                href={`/suppliers/${s.id}`}
                className="card block p-3 transition-colors active:bg-sunken"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">
                      {s.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">
                      {s.phone || "بدون تليفون"}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div
                      className={`text-base font-bold ${
                        s.balance > 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {s.balance > 0 ? formatMoney(s.balance) : "متسوّي"}
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      فواتير {formatMoney(s.purchases)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* ===== كمبيوتر: جدول ===== */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr className="border-b border-line text-right text-ink-muted">
                  <th className="px-4 py-3 font-medium">المورد</th>
                  <th className="px-4 py-3 font-medium">التليفون</th>
                  <th className="px-4 py-3 font-medium">الفواتير</th>
                  <th className="px-4 py-3 font-medium">المدفوع</th>
                  <th className="px-4 py-3 font-medium">اللي عليك</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-line last:border-0 hover:bg-sunken"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link href={`/suppliers/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-body">
                      {formatMoney(s.purchases)}
                    </td>
                    <td className="px-4 py-3 text-success">
                      {formatMoney(s.payments)}
                    </td>
                    <td
                      className={`px-4 py-3 font-bold ${
                        s.balance > 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {s.balance > 0 ? formatMoney(s.balance) : "متسوّي"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ShowMore
            basePath="/suppliers"
            shown={visible.length}
            total={suppliers.length}
          />
        </>
      )}

      <p className="text-xs text-ink-faint">
        الفاتورة = بضاعة أخدتها بالأجل — بتزوّد اللي عليك للمورد بس، مش مصروف
        ومش بتلمس الخزنة. الدفعة = فلوس دفعتها فعلاً، ودي اللي بتتسجّل مصروف
        وبتتخصم من الخزنة وبتقلّل اللي عليك.
      </p>
    </div>
  );
}

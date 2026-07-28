import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPENSE_CATEGORIES,
  cairoToday,
  formatDate,
  formatMoney,
} from "@/lib/format";
import { BackLink } from "@/components/BackLink";
import { SupplierInfo } from "@/components/SupplierInfo";
import {
  SupplierTxnForm,
  type VariantOption,
} from "@/components/SupplierTxnForm";
import { can, requirePagePermission } from "@/lib/permissions";
import {
  addSupplierTransaction,
  deleteSupplier,
  deleteSupplierTransaction,
  updateSupplier,
} from "../actions";

type Txn = {
  id: string;
  kind: string;
  amount: number;
  description: string | null;
  txn_date: string;
  related_cash_id: string | null;
  related_expense_id: string | null;
  supplier_invoice_items: {
    id: string;
    item_name: string;
    quantity: number;
    unit_cost: number;
  }[];
};

export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const user = await requirePagePermission("suppliers.view");
  const canEdit = can(user, "suppliers.edit");
  const admin = createAdminClient();

  const [supplierResult, txnsResult, variantsResult] = await Promise.all([
    admin
      .from("suppliers")
      .select("id, name, phone, notes")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<{
        id: string;
        name: string;
        phone: string | null;
        notes: string | null;
      }>(),
    admin
      .from("supplier_transactions")
      .select(
        `id, kind, amount, description, txn_date, related_cash_id, related_expense_id,
         supplier_invoice_items(id, item_name, quantity, unit_cost)`
      )
      .eq("supplier_id", id)
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)
      .overrideTypes<Txn[]>(),
    admin
      .from("product_variants")
      .select("id, variant_name, sku, cost_price, products(name_ar, name)")
      .order("id")
      .limit(2000)
      .overrideTypes<
        {
          id: string;
          variant_name: string | null;
          sku: string | null;
          cost_price: number;
          products: { name_ar: string | null; name: string | null } | null;
        }[]
      >(),
  ]);

  if (supplierResult.error || !supplierResult.data) notFound();
  const supplier = supplierResult.data;
  const txns = txnsResult.data ?? [];

  // الاسم العربي الأول وبعده الكود — عشان يبقى واضح وهو بيدوّر
  const variants: VariantOption[] = (variantsResult.data ?? [])
    .map((v) => {
      const name = [
        v.products?.name_ar || v.products?.name || "منتج",
        v.variant_name,
      ]
        .filter(Boolean)
        .join(" / ");
      return {
        id: v.id,
        label: v.sku ? `${v.sku} — ${name}` : name,
        cost: Number(v.cost_price ?? 0),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));

  const purchases = txns
    .filter((t) => t.kind === "purchase")
    .reduce((s, t) => s + Number(t.amount), 0);
  const payments = txns
    .filter((t) => t.kind === "payment")
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = purchases - payments;

  // الرصيد الجاري: بنحسبه من الأقدم للأحدث وبعدين نعرض الجدول من الأحدث
  const oldestFirst = [...txns].reverse();
  const running = new Map<string, number>();
  let acc = 0;
  for (const t of oldestFirst) {
    acc += t.kind === "purchase" ? Number(t.amount) : -Number(t.amount);
    running.set(t.id, acc);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackLink href="/suppliers" label="الرجوع للموردين" />
        <h1 className="truncate text-lg font-bold text-gray-900">
          {supplier.name}
        </h1>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <SupplierInfo
        id={supplier.id}
        name={supplier.name}
        phone={supplier.phone}
        notes={supplier.notes}
        canEdit={canEdit}
        updateAction={updateSupplier}
        deleteAction={deleteSupplier}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="col-span-2 rounded-xl bg-white p-4 shadow-sm sm:p-5 lg:col-span-1">
          <p className="text-xs text-gray-500 sm:text-sm">اللي عليك للمورد ده</p>
          <p
            className={`mt-1 text-xl font-bold sm:text-2xl lg:text-4xl ${
              balance > 0
                ? "text-red-600"
                : balance < 0
                  ? "text-amber-600"
                  : "text-green-600"
            }`}
          >
            {balance > 0
              ? formatMoney(balance)
              : balance < 0
                ? `${formatMoney(-balance)} ليك عنده`
                : "متسوّي"}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs text-gray-500 sm:text-sm">إجمالي الفواتير</p>
          <p className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
            {formatMoney(purchases)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs text-gray-500 sm:text-sm">إجمالي المدفوع</p>
          <p className="mt-1 text-xl font-bold text-green-600 sm:text-2xl">
            {formatMoney(payments)}
          </p>
        </div>
      </div>

      {canEdit && (
        <SupplierTxnForm
          supplierId={supplier.id}
          today={cairoToday()}
          categories={EXPENSE_CATEGORIES}
          variants={variants}
          action={addSupplierTransaction}
        />
      )}

      {txns.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          لسه مفيش حركات مع المورد ده.
        </div>
      ) : (
        <>
          {/* ===== موبايل: كروت ===== */}
          <div className="space-y-2 md:hidden">
            {txns.map((t) => {
              const isPayment = t.kind === "payment";
              return (
                <div key={t.id} className="rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {isPayment ? "دفعة" : "فاتورة بضاعة"}
                        {t.related_cash_id && (
                          <span className="ms-1 text-[11px] text-gray-400">
                            (من الخزنة)
                          </span>
                        )}
                        {t.related_expense_id && (
                          <span className="ms-1 text-[11px] text-gray-400">
                            (مصروف)
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <div className="mt-0.5 truncate text-xs text-gray-600">
                          {t.description}
                        </div>
                      )}
                      <div className="mt-0.5 text-[11px] text-gray-400">
                        {formatDate(t.txn_date)} · الرصيد بعدها{" "}
                        {formatMoney(running.get(t.id) ?? 0)}
                      </div>
                      {t.supplier_invoice_items?.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5">
                          {t.supplier_invoice_items.map((it) => (
                            <li
                              key={it.id}
                              className="flex justify-between gap-2 text-[11px] text-gray-600"
                            >
                              <span className="truncate">{it.item_name}</span>
                              <span className="shrink-0 text-gray-400">
                                {it.quantity} × {formatMoney(Number(it.unit_cost))}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div
                      className={`shrink-0 text-base font-bold ${
                        isPayment ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {isPayment ? "−" : "+"} {formatMoney(Number(t.amount))}
                    </div>
                    {canEdit && (
                      <form action={deleteSupplierTransaction} className="shrink-0">
                        <input type="hidden" name="transaction_id" value={t.id} />
                        <input
                          type="hidden"
                          name="supplier_id"
                          value={supplier.id}
                        />
                        <DeleteButton />
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
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
                  <th className="px-4 py-3 font-medium">الرصيد بعدها</th>
                  {canEdit && <th className="px-4 py-3 font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const isPayment = t.kind === "payment";
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-4 py-3 text-gray-700">
                        {formatDate(t.txn_date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {isPayment ? "دفعة" : "فاتورة بضاعة"}
                        {t.related_cash_id && (
                          <span className="ms-1 text-xs text-gray-400">
                            (من الخزنة)
                          </span>
                        )}
                        {t.related_expense_id && (
                          <span className="ms-1 text-xs text-gray-400">
                            (مصروف)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.description ?? "—"}
                        {t.supplier_invoice_items?.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {t.supplier_invoice_items.map((it) => (
                              <li key={it.id} className="text-xs text-gray-500">
                                {it.item_name} — {it.quantity} ×{" "}
                                {formatMoney(Number(it.unit_cost))}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          isPayment ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {isPayment ? "−" : "+"} {formatMoney(Number(t.amount))}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatMoney(running.get(t.id) ?? 0)}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <form action={deleteSupplierTransaction}>
                            <input
                              type="hidden"
                              name="transaction_id"
                              value={t.id}
                            />
                            <input
                              type="hidden"
                              name="supplier_id"
                              value={supplier.id}
                            />
                            <DeleteButton />
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function DeleteButton() {
  return (
    <button
      type="submit"
      title="مسح الحركة"
      className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      </svg>
    </button>
  );
}

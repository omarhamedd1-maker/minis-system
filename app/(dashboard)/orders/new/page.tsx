import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cairoToday, formatMoney } from "@/lib/format";
import { createOrder } from "./actions";

const ITEM_ROWS = 5;

type CustomerOption = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type VariantOption = {
  id: string;
  variant_name: string | null;
  sale_price: number;
  quantity_on_hand: number;
  products: { name: string | null } | null;
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: actionError } = await searchParams;
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    redirect("/orders");
  }

  const [customersResult, variantsResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, phone")
      .order("full_name")
      .limit(500)
      .overrideTypes<CustomerOption[]>(),
    supabase
      .from("product_variants")
      .select("id, variant_name, sale_price, quantity_on_hand, products(name)")
      .overrideTypes<VariantOption[]>(),
  ]);

  const customers = customersResult.data ?? [];
  const variants = (variantsResult.data ?? []).sort((a, b) =>
    (a.products?.name ?? "").localeCompare(b.products?.name ?? "", "ar")
  );

  const today = cairoToday();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">إضافة أوردر يدوي</h1>
        <Link
          href="/orders"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          الرجوع للأوردرات
        </Link>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <form action={createOrder} className="space-y-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">العميل</h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="customer_id" className="text-xs text-gray-500">
                عميل موجود (اختياري)
              </label>
              <select
                id="customer_id"
                name="customer_id"
                defaultValue=""
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              >
                <option value="">— عميل جديد —</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name ?? "بدون اسم"}
                    {customer.phone ? ` (${customer.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-400">
              لو اخترت عميل موجود، سيب الخانات اللي تحت فاضية
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="full_name" className="text-xs text-gray-500">
                  اسم العميل الجديد
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="phone" className="text-xs text-gray-500">
                  التليفون
                </label>
                <input
                  id="phone"
                  name="phone"
                  dir="ltr"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="address" className="text-xs text-gray-500">
                  العنوان
                </label>
                <input
                  id="address"
                  name="address"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">المنتجات</h2>
          <div className="space-y-2">
            {Array.from({ length: ITEM_ROWS }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <select
                  name={`variant_${i}`}
                  defaultValue=""
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                  aria-label={`منتج ${i + 1}`}
                >
                  <option value="">— اختار منتج —</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.products?.name ?? "بدون اسم"}
                      {variant.variant_name ? ` / ${variant.variant_name}` : ""}
                      {" — "}
                      {formatMoney(variant.sale_price)}
                      {` (متاح: ${variant.quantity_on_hand})`}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  name={`qty_${i}`}
                  defaultValue={1}
                  min={1}
                  step={1}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                  aria-label={`كمية منتج ${i + 1}`}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            سيب الصفوف الزيادة على "اختار منتج" — السعر بيتاخد من سعر البيع
            الحالي، والمخزون بيتخصم تلقائياً
          </p>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">بيانات الأوردر</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="order_number" className="text-xs text-gray-500">
                رقم الأوردر (اختياري — لو سبته فاضي هيتولد تلقائياً)
              </label>
              <input
                id="order_number"
                name="order_number"
                dir="ltr"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="order_date" className="text-xs text-gray-500">
                تاريخ الأوردر
              </label>
              <input
                id="order_date"
                name="order_date"
                type="date"
                defaultValue={today}
                required
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="shipping_price" className="text-xs text-gray-500">
                سعر الشحن من العميل (جنيه)
              </label>
              <input
                id="shipping_price"
                name="shipping_price"
                type="number"
                defaultValue={0}
                min={0}
                step="0.01"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="skip_stock"
              value="1"
              className="h-4 w-4 rounded border-gray-300"
            />
            أوردر قديم (من قبل السيستم) — متخصمش من المخزون
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            تسجيل الأوردر
          </button>
        </div>
      </form>
    </div>
  );
}

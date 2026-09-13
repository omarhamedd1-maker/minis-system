import { createClient } from "@/lib/supabase/server";
import { cairoToday } from "@/lib/format";
import { ProductPicker } from "@/components/ProductPicker";
import { BackLink } from "@/components/BackLink";
import { requirePagePermission } from "@/lib/permissions";
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
  sku: string | null;
  sale_price: number;
  products: { name: string | null; name_ar: string | null } | null;
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: actionError } = await searchParams;
  await requirePagePermission("orders.create");
  const supabase = await createClient();

  const [customersResult, variantsResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, phone")
      .order("full_name")
      .limit(500)
      .overrideTypes<CustomerOption[]>(),
    supabase
      .from("product_variants")
      .select("id, variant_name, sku, sale_price, products(name, name_ar)")
      .overrideTypes<VariantOption[]>(),
  ]);

  const customers = customersResult.data ?? [];
  const variants = (variantsResult.data ?? [])
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      name_en: v.products?.name ?? null,
      name_ar: v.products?.name_ar ?? null,
      variant_name: v.variant_name,
      sale_price: v.sale_price,
    }))
    .sort((a, b) =>
      (a.name_ar ?? a.name_en ?? "").localeCompare(
        b.name_ar ?? b.name_en ?? "",
        "ar"
      )
    );

  const today = cairoToday();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">إضافة أوردر يدوي</h1>
        <BackLink href="/orders" label="الرجوع للأوردرات" />
      </div>

      {actionError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}

      <form action={createOrder} className="space-y-4">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">العميل</h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="customer_id" className="text-xs text-ink-muted">
                عميل موجود (اختياري)
              </label>
              <select
                id="customer_id"
                name="customer_id"
                defaultValue=""
                className="field w-auto"
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
            <p className="text-xs text-ink-faint">
              لو اخترت عميل موجود، سيب الخانات اللي تحت فاضية
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="full_name" className="text-xs text-ink-muted">
                  اسم العميل الجديد
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  className="field w-auto"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="phone" className="text-xs text-ink-muted">
                  التليفون
                </label>
                <input
                  id="phone"
                  name="phone"
                  dir="ltr"
                  className="field w-auto"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="address" className="text-xs text-ink-muted">
                  العنوان
                </label>
                <input
                  id="address"
                  name="address"
                  className="field w-auto"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">المنتجات</h2>
          <div className="space-y-2">
            {Array.from({ length: ITEM_ROWS }, (_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <ProductPicker name={`variant_${i}`} variants={variants} />
                </div>
                <input
                  type="number"
                  name={`qty_${i}`}
                  defaultValue={1}
                  min={1}
                  step={1}
                  className="field w-20 px-2"
                  aria-label={`كمية منتج ${i + 1}`}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            سيب الصفوف اللي مش محتاجها فاضية — السعر بيتاخد من سعر البيع الحالي،
            والمخزون بيتخصم تلقائياً
          </p>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">بيانات الأوردر</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="order_number" className="text-xs text-ink-muted">
                رقم الأوردر (اختياري — لو سبته فاضي هيتولد تلقائياً)
              </label>
              <input
                id="order_number"
                name="order_number"
                dir="ltr"
                className="field w-auto"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="order_date" className="text-xs text-ink-muted">
                تاريخ الأوردر
              </label>
              <input
                id="order_date"
                name="order_date"
                type="date"
                defaultValue={today}
                required
                className="field w-auto"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="shipping_price" className="text-xs text-ink-muted">
                سعر الشحن من العميل (جنيه)
              </label>
              <input
                id="shipping_price"
                name="shipping_price"
                type="number"
                defaultValue={0}
                min={0}
                step="0.01"
                className="field w-auto"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-body">
            <input
              type="checkbox"
              name="skip_stock"
              value="1"
              className="h-4 w-4 rounded border-line-strong"
            />
            أوردر قديم (من قبل السيستم) — متخصمش من المخزون
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary px-6"
          >
            تسجيل الأوردر
          </button>
        </div>
      </form>
    </div>
  );
}

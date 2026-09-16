import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COST_COMPONENTS, formatMoney } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import { DiscountCalculator } from "@/components/DiscountCalculator";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BackLink } from "@/components/BackLink";
import {
  deleteProduct,
  saveCostComponents,
  saveProductName,
  saveSalePrice,
  saveSku,
  saveStock,
} from "../actions";
import { allRows } from "@/lib/fetch-all-pages";

type ProductDetails = {
  id: string;
  name: string | null;
  name_ar: string | null;
  product_variants: {
    id: string;
    variant_name: string | null;
    sku: string | null;
    cost_price: number;
    sale_price: number;
    quantity_on_hand: number;
    variant_cost_components: { component: string; amount: number }[];
  }[];
};

export default async function ProductDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error: actionError, saved } = await searchParams;
  const user = await requirePagePermission("products.view");
  const isAdmin =
    can(user, "products.edit") ||
    can(user, "products.cost") ||
    can(user, "products.stock");
  const supabase = await createClient();

  // ⚠️ **أرقام الحاسبة من داتاك مش من تخمين**: الشحن من إعداداتك، ونسبة
  // الرجوع من شحناتك اللي خلصت مشوارها فعلًا.
  const admin = createAdminClient();
  const [{ data: creds }, { data: settled }] = await Promise.all([
    admin
      .from("tenant_credentials")
      .select("flat_shipping_price")
      .eq("tenant_id", user.tenantId)
      .maybeSingle(),
    allRows(admin
      .from("orders")
      .select("order_status")
      .eq("tenant_id", user.tenantId)
      .in("order_status", ["delivered", "returned", "returned_after_delivery"])),
  ]);

  const rows = (settled ?? []) as { order_status: string | null }[];
  const returned = rows.filter((o) =>
    ["returned", "returned_after_delivery"].includes(String(o.order_status))
  ).length;
  const returnRate = rows.length > 0 ? returned / rows.length : 0;
  const shippingCharged =
    Number(
      (creds as { flat_shipping_price: number | null } | null)?.flat_shipping_price ?? 0
    ) || 0;
  // ⚠️ **٨٨ هو الشحن الأساسي اللي باقة بوسطة بتغطيه** — الرقم ده ثابت في
  // `lib/format.ts` ومستخدم في حساب تكلفة الشحن في كل السيستم.
  const shippingCost = 88;

  const { data: product, error } = await supabase
    .from("products")
    .select(
      `id, name, name_ar,
       product_variants(id, variant_name, sku, cost_price, sale_price, quantity_on_hand,
         variant_cost_components(component, amount))`
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<ProductDetails>();

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        حصل خطأ أثناء تحميل المنتج: {error.message}
      </div>
    );
  }

  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {product.name_ar ?? product.name ?? "بدون اسم"}
          </h1>
          {product.name && (
            <p className="text-sm text-ink-faint" dir="ltr">
              {product.name}
            </p>
          )}
        </div>
        <BackLink href="/products" label="الرجوع للمنتجات" />
      </div>

      {isAdmin && (
        <form
          action={saveProductName}
          className="card flex flex-wrap items-end gap-3 p-4"
        >
          <input type="hidden" name="product_id" value={product.id} />
          <div className="flex flex-col gap-1">
            <label htmlFor="name_ar" className="text-xs text-ink-muted">
              الاسم بالعربي (اللي انت بتعرف بيه المنتج)
            </label>
            <input
              id="name_ar"
              name="name_ar"
              defaultValue={product.name_ar ?? ""}
              className="w-64 rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
          >
            حفظ الاسم
          </button>
        </form>
      )}

      {actionError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم حفظ التعديل
        </div>
      )}

      {product.product_variants.map((variant) => {
        const componentAmounts = new Map(
          variant.variant_cost_components.map((c) => [c.component, c.amount])
        );
        return (
          <div key={variant.id} className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-bold text-ink">
                  {variant.variant_name ?? "افتراضي"}
                </h2>
                {isAdmin ? (
                  <form action={saveSku} className="flex items-center gap-2">
                    <input type="hidden" name="variant_id" value={variant.id} />
                    <input type="hidden" name="product_id" value={product.id} />
                    <input
                      name="sku"
                      defaultValue={variant.sku ?? ""}
                      placeholder="الكود (SKU)"
                      dir="ltr"
                      className="w-32 rounded-control border border-line-strong px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                      aria-label="الكود"
                    />
                    <button
                      type="submit"
                      className="rounded-control bg-sunken px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-line"
                    >
                      حفظ الكود
                    </button>
                  </form>
                ) : (
                  variant.sku && (
                    <span
                      className="rounded-full bg-sunken px-2.5 py-0.5 text-xs text-ink-muted"
                      dir="ltr"
                    >
                      {variant.sku}
                    </span>
                  )
                )}
              </div>
              {isAdmin ? (
                <form
                  action={saveSalePrice}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="variant_id" value={variant.id} />
                  <input type="hidden" name="product_id" value={product.id} />
                  <label className="text-sm text-ink-muted">سعر البيع</label>
                  <input
                    type="number"
                    name="sale_price"
                    defaultValue={variant.sale_price}
                    min={0}
                    step="0.01"
                    className="w-28 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
                    aria-label="سعر البيع"
                  />
                  <button
                    type="submit"
                    className="rounded-control bg-sunken px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-line"
                  >
                    حفظ
                  </button>
                </form>
              ) : (
                <span className="text-sm text-ink-muted">
                  سعر البيع: {formatMoney(variant.sale_price)}
                </span>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-bold text-ink-body">
                  مكونات التكلفة
                </h3>
                {isAdmin ? (
                  <form action={saveCostComponents} className="space-y-2">
                    <input
                      type="hidden"
                      name="variant_id"
                      value={variant.id}
                    />
                    <input
                      type="hidden"
                      name="product_id"
                      value={product.id}
                    />
                    {COST_COMPONENTS.map((component) => (
                      <div
                        key={component}
                        className="flex items-center justify-between gap-3"
                      >
                        <label
                          htmlFor={`comp-${variant.id}-${component}`}
                          className="text-sm text-ink-muted"
                        >
                          {component}
                        </label>
                        <input
                          id={`comp-${variant.id}-${component}`}
                          type="number"
                          name={`comp_${component}`}
                          defaultValue={componentAmounts.get(component) ?? 0}
                          min={0}
                          step="0.01"
                          className="w-28 rounded-control border border-line-strong px-2 py-1 text-left text-sm text-ink focus:border-primary focus:outline-none"
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-line pt-3">
                      <span className="text-sm font-bold text-ink">
                        إجمالي التكلفة الحالية: {formatMoney(variant.cost_price)}
                      </span>
                      <button
                        type="submit"
                        className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                      >
                        حفظ المكونات
                      </button>
                    </div>
                    <p className="text-xs text-ink-faint">
                      التكلفة الإجمالية بتتحسب تلقائياً من مجموع المكونات
                    </p>
                  </form>
                ) : (
                  <div className="space-y-2">
                    {COST_COMPONENTS.map((component) => (
                      <div
                        key={component}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-ink-muted">{component}</span>
                        <span className="text-ink">
                          {formatMoney(componentAmounts.get(component) ?? 0)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-line pt-3 text-sm font-bold text-ink">
                      إجمالي التكلفة: {formatMoney(variant.cost_price)}
                    </div>
                  </div>
                )}
              </div>

              {/*
                حاسبة الخصم الآمن.

                ⚠️ **بتدخل نسبة الرجوع في الحساب** — «خصم ٢٠٪» بيبان بسيط،
                والشحنة اللي بترجع بتدفع شحن ومابتحصّلش، ونصيبها بيتوزّع
                على اللي وصل.
              */}
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-bold text-ink-body">
                  تقدر تخصم كام
                </h3>
                <DiscountCalculator
                  price={Number(variant.sale_price ?? 0)}
                  cost={Number(variant.cost_price ?? 0)}
                  shippingCharged={shippingCharged}
                  shippingCost={shippingCost}
                  returnRate={returnRate}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-ink-body">المخزون</h3>
                {isAdmin ? (
                  <form
                    action={saveStock}
                    className="flex items-center gap-3"
                  >
                    <input
                      type="hidden"
                      name="variant_id"
                      value={variant.id}
                    />
                    <input
                      type="hidden"
                      name="return_to"
                      value={`/products/${product.id}`}
                    />
                    <input
                      type="number"
                      name="quantity"
                      defaultValue={variant.quantity_on_hand}
                      min={0}
                      step={1}
                      className="w-24 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
                      aria-label="المخزون"
                    />
                    <button
                      type="submit"
                      className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                    >
                      حفظ المخزون
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-ink">
                    {variant.quantity_on_hand} قطعة
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {isAdmin && (
        <div className="flex justify-end border-t border-line pt-6">
          <form action={deleteProduct}>
            <input type="hidden" name="product_id" value={product.id} />
            <ConfirmButton
              message={`متأكد إنك عايز تمسح المنتج "${product.name_ar ?? product.name ?? ""}"؟`}
              className="rounded-control bg-danger-soft px-4 py-1.5 text-sm font-medium text-danger hover:bg-danger-line"
            >
              مسح المنتج
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}

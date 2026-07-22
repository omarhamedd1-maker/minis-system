import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COST_COMPONENTS, formatMoney } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  deleteProduct,
  saveCostComponents,
  saveProductName,
  saveSalePrice,
  saveSku,
  saveStock,
} from "../actions";

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
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
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
          <h1 className="text-xl font-bold text-gray-900">
            {product.name_ar ?? product.name ?? "بدون اسم"}
          </h1>
          {product.name && (
            <p className="text-sm text-gray-400" dir="ltr">
              {product.name}
            </p>
          )}
        </div>
        <Link
          href="/products"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          الرجوع للمنتجات
        </Link>
      </div>

      {isAdmin && (
        <form
          action={saveProductName}
          className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm"
        >
          <input type="hidden" name="product_id" value={product.id} />
          <div className="flex flex-col gap-1">
            <label htmlFor="name_ar" className="text-xs text-gray-500">
              الاسم بالعربي (اللي انت بتعرف بيه المنتج)
            </label>
            <input
              id="name_ar"
              name="name_ar"
              defaultValue={product.name_ar ?? ""}
              className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            حفظ الاسم
          </button>
        </form>
      )}

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم حفظ التعديل
        </div>
      )}

      {product.product_variants.map((variant) => {
        const componentAmounts = new Map(
          variant.variant_cost_components.map((c) => [c.component, c.amount])
        );
        return (
          <div key={variant.id} className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-bold text-gray-900">
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
                      className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                      aria-label="الكود"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      حفظ الكود
                    </button>
                  </form>
                ) : (
                  variant.sku && (
                    <span
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
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
                  <label className="text-sm text-gray-500">سعر البيع</label>
                  <input
                    type="number"
                    name="sale_price"
                    defaultValue={variant.sale_price}
                    min={0}
                    step="0.01"
                    className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                    aria-label="سعر البيع"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    حفظ
                  </button>
                </form>
              ) : (
                <span className="text-sm text-gray-500">
                  سعر البيع: {formatMoney(variant.sale_price)}
                </span>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-bold text-gray-700">
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
                          className="text-sm text-gray-600"
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
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-left text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                      <span className="text-sm font-bold text-gray-900">
                        إجمالي التكلفة الحالية: {formatMoney(variant.cost_price)}
                      </span>
                      <button
                        type="submit"
                        className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                      >
                        حفظ المكونات
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">
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
                        <span className="text-gray-600">{component}</span>
                        <span className="text-gray-900">
                          {formatMoney(componentAmounts.get(component) ?? 0)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 pt-3 text-sm font-bold text-gray-900">
                      إجمالي التكلفة: {formatMoney(variant.cost_price)}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-gray-700">المخزون</h3>
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
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      aria-label="المخزون"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                    >
                      حفظ المخزون
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-gray-900">
                    {variant.quantity_on_hand} قطعة
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {isAdmin && (
        <div className="flex justify-end border-t border-gray-200 pt-6">
          <form action={deleteProduct}>
            <input type="hidden" name="product_id" value={product.id} />
            <ConfirmButton
              message={`متأكد إنك عايز تمسح المنتج "${product.name_ar ?? product.name ?? ""}"؟`}
              className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              مسح المنتج
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { saveStock } from "./actions";

type ProductRow = {
  id: string;
  name: string | null;
  product_variants: {
    id: string;
    variant_name: string | null;
    sku: string | null;
    cost_price: number;
    sale_price: number;
    quantity_on_hand: number;
  }[];
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error: actionError, saved } = await searchParams;
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");

  const { data: products, error } = await supabase
    .from("products")
    .select(
      "id, name, product_variants(id, variant_name, sku, cost_price, sale_price, quantity_on_hand)"
    )
    .order("name")
    .overrideTypes<ProductRow[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل المنتجات: {error.message}
      </div>
    );
  }

  const variantCount = products.reduce(
    (sum, product) => sum + product.product_variants.length,
    0
  );
  const missingCostCount = products.reduce(
    (sum, product) =>
      sum + product.product_variants.filter((v) => v.cost_price === 0).length,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">المنتجات والمخزون</h1>
        <span className="text-sm text-gray-500">
          {products.length} منتج / {variantCount} شكل
        </span>
      </div>

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
      {missingCostCount > 0 && (
        <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          فيه {missingCostCount} شكل منتج تكلفته صفر — افتح المنتج وسجّل مكونات
          تكلفته عشان الأرباح تتحسب صح. الصفوف دي معلّمة باللون الأصفر.
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          لسه مفيش منتجات. المنتجات بتتسجل هنا تلقائياً مع أول أوردر ييجي من
          شوبيفاي.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">المنتج</th>
                <th className="px-4 py-3 font-medium">الشكل</th>
                <th className="px-4 py-3 font-medium">سعر البيع</th>
                <th className="px-4 py-3 font-medium">التكلفة</th>
                <th className="px-4 py-3 font-medium">المخزون</th>
                {isAdmin && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {products.flatMap((product) =>
                product.product_variants.map((variant, index) => (
                  <tr
                    key={variant.id}
                    className={`border-b border-gray-100 last:border-0 ${
                      variant.cost_price === 0 ? "bg-yellow-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {variant.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {index === 0 ? (
                        <Link
                          href={`/products/${product.id}`}
                          className="hover:underline"
                        >
                          {product.name ?? "بدون اسم"}
                        </Link>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {variant.variant_name ?? "افتراضي"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(variant.sale_price)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(variant.cost_price)}
                    </td>
                    {isAdmin ? (
                      <>
                        <td className="px-4 py-3">
                          <form
                            id={`stock-${variant.id}`}
                            action={saveStock}
                          >
                            <input
                              type="hidden"
                              name="variant_id"
                              value={variant.id}
                            />
                            <input
                              type="hidden"
                              name="return_to"
                              value="/products"
                            />
                          </form>
                          <input
                            type="number"
                            name="quantity"
                            form={`stock-${variant.id}`}
                            defaultValue={variant.quantity_on_hand}
                            min={0}
                            step={1}
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                            aria-label="المخزون"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              form={`stock-${variant.id}`}
                              className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                            >
                              حفظ
                            </button>
                            <Link
                              href={`/products/${product.id}`}
                              className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                            >
                              فتح
                            </Link>
                          </div>
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-3 text-gray-700">
                        {variant.quantity_on_hand}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

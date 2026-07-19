import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";

type ProductRow = {
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
  }[];
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; q?: string }>;
}) {
  const { error: actionError, saved, q } = await searchParams;
  const searchTerm = (q ?? "").trim();
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");

  const { data: allProducts, error } = await supabase
    .from("products")
    .select(
      "id, name, name_ar, product_variants(id, variant_name, sku, cost_price, sale_price, quantity_on_hand)"
    )
    .order("name_ar")
    .overrideTypes<ProductRow[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل المنتجات: {error.message}
      </div>
    );
  }

  const normalized = searchTerm.toLowerCase().replace(/\s+/g, "");
  const products = searchTerm
    ? allProducts.filter((p) => {
        const ar = (p.name_ar ?? "").toLowerCase().replace(/\s+/g, "");
        const en = (p.name ?? "").toLowerCase().replace(/\s+/g, "");
        const sku = (p.product_variants[0]?.sku ?? "").toLowerCase();
        return (
          ar.includes(normalized) ||
          en.includes(normalized) ||
          sku.includes(searchTerm.toLowerCase())
        );
      })
    : allProducts;

  const variantCount = products.reduce(
    (sum, product) => sum + product.product_variants.length,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">المنتجات والمخزون</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">
            {products.length} منتج / {variantCount} شكل
          </span>
          <form action="/products" className="flex items-center gap-1">
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="دور بالاسم أو الكود"
              className="w-52 rounded-full border-0 bg-white px-3 py-1 text-xs text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            <button
              type="submit"
              className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
            >
              بحث
            </button>
            {searchTerm && (
              <Link
                href="/products"
                className="rounded-full bg-white px-2 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-100"
              >
                ✕
              </Link>
            )}
          </form>
        </div>
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
      {products.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          {searchTerm
            ? `مفيش منتجات فيها "${searchTerm}".`
            : "لسه مفيش منتجات. المنتجات بتتسجل هنا تلقائياً مع أول أوردر ييجي من شوبيفاي."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">المنتج</th>
                <th className="px-4 py-3 font-medium">الاسم في شوبيفاي</th>
                <th className="px-4 py-3 font-medium">الشكل</th>
                <th className="px-4 py-3 font-medium">سعر البيع</th>
                <th className="px-4 py-3 font-medium">التكلفة</th>
                <th className="px-4 py-3 font-medium">المخزون</th>
                <th className="px-4 py-3 font-medium"></th>
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
                      {index === 0 ? product.name_ar ?? product.name ?? "بدون اسم" : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-500" dir="ltr">
                      {index === 0 ? product.name ?? "—" : ""}
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
                    <td className="px-4 py-3 text-gray-700">
                      {variant.quantity_on_hand}
                    </td>
                    <td className="px-4 py-3">
                      {index === 0 && (
                        <Link
                          href={`/products/${product.id}`}
                          className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          فتح
                        </Link>
                      )}
                    </td>
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

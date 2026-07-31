import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEGACY_BUCKET_PRODUCT, formatMoney } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import { ImportShopifyProducts } from "@/components/ImportShopifyProducts";
import { CostFile } from "@/components/CostFile";
import { importShopifyProducts, uploadCostFile } from "./actions";

const SHOPIFY_STATUS: Record<
  string,
  { label: string; className: string }
> = {
  active: { label: "نشط", className: "bg-green-50 text-green-700" },
  draft: { label: "مسودة", className: "bg-gray-100 text-gray-600" },
  archived: { label: "مؤرشف", className: "bg-orange-50 text-orange-700" },
};

function shopifyStatusBadge(status: string | null) {
  if (!status) return <span className="text-xs text-gray-300">—</span>;
  const s = SHOPIFY_STATUS[status.toLowerCase()] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}

type ProductRow = {
  id: string;
  name: string | null;
  name_ar: string | null;
  deleted_in_shopify: boolean;
  shopify_status: string | null;
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
  searchParams: Promise<{
    error?: string;
    saved?: string;
    deleted?: string;
    q?: string;
    missing_cost?: string;
  }>;
}) {
  const {
    error: actionError,
    saved,
    deleted,
    q,
    missing_cost: missingCost,
  } = await searchParams;
  const searchTerm = (q ?? "").trim();
  const onlyMissingCost = missingCost === "1";
  const me = await requirePagePermission("products.view");
  const canEdit = can(me, "products.edit");
  const supabase = await createClient();

  const { data: allProducts, error } = await supabase
    .from("products")
    .select(
      "id, name, name_ar, deleted_in_shopify, shopify_status, product_variants(id, variant_name, sku, cost_price, sale_price, quantity_on_hand)"
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

  // نخفي صندوق تجميع الأوردرات القديمة من شاشة المنتجات (مش منتج حقيقي)
  // ونرتّب بالكود (الرقمي الأول، واللي مالوش كود في الآخر)
  const skuOf = (p: ProductRow) => p.product_variants[0]?.sku ?? "";
  const visibleProducts = allProducts
    .filter((p) => p.name !== LEGACY_BUCKET_PRODUCT)
    .sort((a, b) => {
      const sa = skuOf(a);
      const sb = skuOf(b);
      if (!sa && !sb) return 0;
      if (!sa) return 1;
      if (!sb) return -1;
      const na = Number(sa);
      const nb = Number(sb);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return sa.localeCompare(sb);
    });

  // كام شكل لسه محتاج تكلفة — بيتعرض على زرار التنزيل
  const missingCostCount = visibleProducts.reduce(
    (sum, p) =>
      sum + p.product_variants.filter((v) => !(Number(v.cost_price) > 0)).length,
    0
  );

  // فلتر "الناقص" — الأشكال اللي تكلفتها صفر، اللي الجلب من شوبيفاي بيوديك لها
  const costFiltered = onlyMissingCost
    ? visibleProducts.filter((p) =>
        p.product_variants.some((v) => !(Number(v.cost_price) > 0))
      )
    : visibleProducts;

  const normalized = searchTerm.toLowerCase().replace(/\s+/g, "");
  const products = searchTerm
    ? costFiltered.filter((p) => {
        const ar = (p.name_ar ?? "").toLowerCase().replace(/\s+/g, "");
        const en = (p.name ?? "").toLowerCase().replace(/\s+/g, "");
        const sku = (p.product_variants[0]?.sku ?? "").toLowerCase();
        return (
          ar.includes(normalized) ||
          en.includes(normalized) ||
          sku.includes(searchTerm.toLowerCase())
        );
      })
    : costFiltered;

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
          {canEdit && <ImportShopifyProducts action={importShopifyProducts} />}
        </div>
      </div>

      {onlyMissingCost && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>
            بنعرض المنتجات اللي فيها شكل بتكلفة صفر بس — الربح فيها بيطلع أكبر
            من الحقيقة.
          </span>
          <Link
            href="/products"
            className="shrink-0 font-medium underline hover:text-amber-950"
          >
            اعرض الكل
          </Link>
        </div>
      )}

      {canEdit && (
        <CostFile action={uploadCostFile} missingCount={missingCostCount} />
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
      {deleted && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم مسح المنتج
        </div>
      )}
      {products.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          {searchTerm
            ? `مفيش منتجات فيها "${searchTerm}".`
            : "لسه مفيش منتجات. المنتجات بتتسجل هنا تلقائياً مع أول أوردر ييجي من شوبيفاي."}
        </div>
      ) : (
        <>
        {/* ===== موبايل: كروت (مفيش سحب جانبي) ===== */}
        <div className="space-y-2 md:hidden">
          {products.map((product) => {
            const stock = product.product_variants.reduce(
              (s, v) => s + v.quantity_on_hand,
              0
            );
            const v0 = product.product_variants[0];
            return (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="block rounded-xl bg-white p-3 shadow-sm transition-colors active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-gray-900">
                      {product.name_ar ?? product.name ?? "بدون اسم"}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400" dir="ltr">
                      {v0?.sku ?? "—"}
                      {product.product_variants.length > 1 &&
                        ` · ${product.product_variants.length} أشكال`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {shopifyStatusBadge(product.shopify_status)}
                    {product.deleted_in_shopify && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                        اتمسح من شوبيفاي
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-gray-100 pt-2 text-xs">
                  <span className="text-gray-600">
                    البيع:{" "}
                    <span className="font-medium text-gray-900">
                      {v0 ? formatMoney(v0.sale_price) : "—"}
                    </span>
                  </span>
                  <span className="text-gray-600">
                    التكلفة:{" "}
                    <span
                      className={`font-medium ${v0 && v0.cost_price > 0 ? "text-gray-900" : "text-red-600"}`}
                    >
                      {v0 ? formatMoney(v0.cost_price) : "—"}
                    </span>
                  </span>
                  <span className="text-gray-600">
                    المخزون:{" "}
                    <span
                      className={`font-medium ${stock > 0 ? "text-gray-900" : "text-red-600"}`}
                    >
                      {stock}
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ===== كمبيوتر: جدول ===== */}
        <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm md:block">
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
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.flatMap((product) =>
                product.product_variants.map((variant, index) => (
                  <tr
                    key={variant.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-3 text-gray-700" dir="ltr">
                      {variant.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {index === 0 && (
                        <span className="flex items-center gap-2">
                          {product.name_ar ?? product.name ?? "بدون اسم"}
                          {product.deleted_in_shopify && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                              اتمسح من شوبيفاي
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500" dir="ltr">
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
                      {index === 0 && shopifyStatusBadge(product.shopify_status)}
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
        </>
      )}
    </div>
  );
}

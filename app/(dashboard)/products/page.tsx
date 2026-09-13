import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEGACY_BUCKET_PRODUCT, formatMoney } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import {
  stockRunway,
  runningOut,
  untrackedSellers,
  WINDOW_DAYS,
} from "@/lib/stock-runway";
import { deadStock, frozenValue, withoutCost, DEAD_AFTER_DAYS } from "@/lib/dead-stock";
import { ImportShopifyProducts } from "@/components/ImportShopifyProducts";
import { importShopifyProducts } from "./actions";

const SHOPIFY_STATUS: Record<
  string,
  { label: string; className: string }
> = {
  active: { label: "نشط", className: "bg-success-soft text-success" },
  draft: { label: "مسودة", className: "bg-sunken text-ink-muted" },
  archived: { label: "مؤرشف", className: "bg-warning-soft text-warning" },
};

function shopifyStatusBadge(status: string | null) {
  if (!status) return <span className="text-xs text-ink-faint">—</span>;
  const s = SHOPIFY_STATUS[status.toLowerCase()] ?? {
    label: status,
    className: "bg-sunken text-ink-muted",
  };
  return (
    <span
      className={`badge ${s.className}`}
    >
      {s.label}
    </span>
  );
}

type ProductRow = {
  id: string;
  name: string | null;
  name_ar: string | null;
  image_url: string | null;
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
      "id, name, name_ar, image_url, deleted_in_shopify, shopify_status, product_variants(id, variant_name, sku, cost_price, sale_price, quantity_on_hand)"
    )
    .order("name_ar")
    .overrideTypes<ProductRow[]>();

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
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

  // ⚠️ **«فاضل ٩ قطع» مش معلومة لوحدها** — ٩ من حاجة بتتباع ٣ في اليوم
  // معناها ٣ أيام. الاستعلام ده بيجيب بيع آخر شهر بس عشان يطلّع المعدّل.
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const salesRows =
    (
      await supabase
        .from("orders")
        .select("order_status, order_date, order_items(variant_id, quantity)")
        .gte("order_date", since)
        .limit(2000)
        .overrideTypes<
          {
            order_status: string | null;
            order_date: string | null;
            order_items: { variant_id: string | null; quantity: number }[] | null;
          }[]
        >()
    ).data ?? [];

  const runway = stockRunway(
      visibleProducts.flatMap((p) =>
        p.product_variants.map((v) => ({
          id: v.id,
          name:
            (p.name_ar || p.name || "منتج") +
            (String(v.variant_name ?? "").trim()
              ? " — " + String(v.variant_name).trim()
              : ""),
          onHand: Number(v.quantity_on_hand ?? 0),
        }))
      ),
      salesRows.flatMap((o) =>
        (o.order_items ?? []).map((i) => ({
          variantId: i.variant_id,
          at: o.order_date,
          orderStatus: o.order_status,
          quantity: Number(i.quantity) || 0,
        }))
      ),
    now
  );

  const lowStock = runningOut(runway);
  const untracked = untrackedSellers(runway);

  // ⚠️ **البضاعة الميتة محتاجة تاريخ أطول من الاستعلام اللي فوق** — ده
  // بيجيب آخر بيعة لكل شكل بس، مش كل البيعات.
  const lastSales =
    (
      await supabase
        .from("orders")
        .select("order_status, order_date, order_items(variant_id)")
        .gte("order_date", new Date(now.getTime() - 400 * 86_400_000).toISOString())
        .limit(4000)
        .overrideTypes<
          {
            order_status: string | null;
            order_date: string | null;
            order_items: { variant_id: string | null }[] | null;
          }[]
        >()
    ).data ?? [];

  const dead = deadStock(
    visibleProducts.flatMap((p) =>
      p.product_variants.map((v) => ({
        id: v.id,
        name:
          (p.name_ar || p.name || "منتج") +
          (String(v.variant_name ?? "").trim()
            ? " — " + String(v.variant_name).trim()
            : ""),
        onHand: Number(v.quantity_on_hand ?? 0),
        costPrice: Number(v.cost_price ?? 0),
      }))
    ),
    lastSales.flatMap((o) =>
      (o.order_items ?? []).map((i) => ({
        variantId: i.variant_id,
        at: o.order_date,
        orderStatus: o.order_status,
      }))
    ),
    now
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
        <h1 className="text-xl font-bold text-ink">المنتجات والمخزون</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">
            {products.length} منتج / {variantCount} شكل
          </span>
          <form action="/products" className="flex items-center gap-1">
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="دور بالاسم أو الكود"
              className="w-52 rounded-full border-0 bg-surface px-3 py-1 text-xs text-ink shadow-card placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark"
            >
              بحث
            </button>
            {searchTerm && (
              <Link
                href="/products"
                className="rounded-full bg-surface px-2 py-1 text-xs text-ink-muted shadow-card hover:bg-sunken"
              >
                ✕
              </Link>
            )}
          </form>
          {canEdit && <ImportShopifyProducts action={importShopifyProducts} />}
        </div>
      </div>

      {/*
        قرّب يخلص.

        ⚠️ **اللي مااتباعش ٣ قطع في الشهر مش هنا** — مش هينفد، وتحذير
        عليه بيغرق التحذير الحقيقي.
      */}
      {/*
        ⚠️ **رقم مش متمسك، مش بضاعة خلصت.** محدش بيبيع ٧٣ قطعة من مخزون
        صفر. بيتعرض كخبر هادي عشان التنبيه يفضل معناه «اتصرّف».
      */}
      {untracked.length > 0 && (
        <div className="rounded-control bg-sunken px-4 py-2.5 text-sm text-ink-muted">
          <span className="font-medium">
            {untracked.length} شكل بيتباع ومخزونه مكتوب صفر
          </span>
          {" — "}
          {untracked.slice(0, 3).map((r) => r.name).join("، ")}
          {untracked.length > 3 ? " وغيرهم" : ""}. يعني الرقم مش بيتحدّث،
          فتنبيه النفاد مابيشتغلش عليهم.
        </div>
      )}

      {/*
        بضاعة ميتة — فلوس واقفة على الرف.

        ⚠️ **القيمة بالتكلفة مش بسعر البيع** — اللي متجمّد هو اللي دفعته.
      */}
      {dead.length > 0 && (
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">
              بضاعة واقفة من {DEAD_AFTER_DAYS} يوم
            </h2>
            <span className="text-xs text-ink-muted">
              {frozenValue(dead) > 0 &&
                `${formatMoney(frozenValue(dead))} متجمّدة`}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            القيمة بالتكلفة اللي دفعتها، مش بسعر البيع.
            {withoutCost(dead) > 0 &&
              ` و${withoutCost(dead)} منهم تكلفتهم مش متسجّلة، فالرقم أقل من الحقيقة.`}
          </p>
          <div className="mt-3 space-y-1.5">
            {dead.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {r.name}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-ink-muted">
                  {r.value !== null ? formatMoney(r.value) : `${r.onHand} قطعة`}
                  {" · "}
                  {r.days === null ? "عمره ما اتباع" : `${r.days} يوم`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">قرّب يخلص</h2>
            <span className="text-xs text-ink-muted">
              على معدّل بيع آخر {WINDOW_DAYS} يوم
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {lowStock.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {r.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span
                    className={
                      (r.daysLeft ?? 0) <= 3 ? "text-danger" : "text-warning"
                    }
                  >
                    {r.daysLeft} يوم
                  </span>{" "}
                  <span className="text-xs text-ink-faint">
                    (فاضل {r.onHand} · باع {r.soldInWindow})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onlyMissingCost && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-warning-soft px-4 py-2.5 text-sm text-warning">
          <span>
            بنعرض المنتجات اللي فيها شكل بتكلفة صفر بس — الربح فيها بيطلع أكبر
            من الحقيقة.
          </span>
          <Link
            href="/products"
            className="shrink-0 font-medium underline hover:text-ink"
          >
            اعرض الكل
          </Link>
        </div>
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
      {deleted && (
        <div className="rounded-control bg-success-soft px-4 py-3 text-sm text-success">
          تم مسح المنتج
        </div>
      )}
      {products.length === 0 ? (
        <div className="rounded-card bg-surface p-12 text-center text-ink-muted shadow-card">
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
                className="block rounded-card bg-surface p-3 shadow-card transition-colors active:bg-sunken"
              >
                <div className="flex items-start justify-between gap-2">
                  {/* ⚠️ صورة شوبيفاي — الاسم لوحده مابيفرقش بين ١٠٠ منتج */}
                  {product.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-control bg-sunken object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">
                      {product.name_ar ?? product.name ?? "بدون اسم"}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-faint" dir="ltr">
                      {v0?.sku ?? "—"}
                      {product.product_variants.length > 1 &&
                        ` · ${product.product_variants.length} أشكال`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {shopifyStatusBadge(product.shopify_status)}
                    {product.deleted_in_shopify && (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-medium text-danger">
                        اتمسح من شوبيفاي
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
                  <span className="text-ink-muted">
                    البيع:{" "}
                    <span className="font-medium text-ink">
                      {v0 ? formatMoney(v0.sale_price) : "—"}
                    </span>
                  </span>
                  <span className="text-ink-muted">
                    التكلفة:{" "}
                    <span
                      className={`font-medium ${v0 && v0.cost_price > 0 ? "text-ink" : "text-danger"}`}
                    >
                      {v0 ? formatMoney(v0.cost_price) : "—"}
                    </span>
                  </span>
                  <span className="text-ink-muted">
                    المخزون:{" "}
                    <span
                      className={`font-medium ${stock > 0 ? "text-ink" : "text-danger"}`}
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
        <div className="hidden overflow-x-auto rounded-card bg-surface shadow-card md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-right text-ink-muted">
                <th className="w-12 px-2 py-3"></th>
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
                    className="border-b border-line last:border-0"
                  >
                    {/*
                      ⚠️ **الصورة أول السطر من اليمين** — العين بتمسك الصورة
                      قبل النص، والاسم لوحده مابيفرقش بين منتجات أسماؤها
                      متشابهة.
                    */}
                    <td className="w-12 px-2 py-2">
                      {index === 0 && product.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image_url}
                          alt=""
                          className="h-9 w-9 rounded bg-sunken object-cover"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-body" dir="ltr">
                      {variant.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {index === 0 && (
                        <span className="flex items-center gap-2">
                          {product.name_ar ?? product.name ?? "بدون اسم"}
                          {product.deleted_in_shopify && (
                            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                              اتمسح من شوبيفاي
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-muted" dir="ltr">
                      {index === 0 ? product.name ?? "—" : ""}
                    </td>
                    <td className="px-4 py-3 text-ink-body">
                      {variant.variant_name ?? "افتراضي"}
                    </td>
                    <td className="px-4 py-3 text-ink-body">
                      {formatMoney(variant.sale_price)}
                    </td>
                    <td className="px-4 py-3 text-ink-body">
                      {formatMoney(variant.cost_price)}
                    </td>
                    <td className="px-4 py-3 text-ink-body">
                      {variant.quantity_on_hand}
                    </td>
                    <td className="px-4 py-3">
                      {index === 0 && shopifyStatusBadge(product.shopify_status)}
                    </td>
                    <td className="px-4 py-3">
                      {index === 0 && (
                        <Link
                          href={`/products/${product.id}`}
                          className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
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

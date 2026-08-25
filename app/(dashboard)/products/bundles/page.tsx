import { BackLink } from "@/components/BackLink";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, requirePagePermission } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { itemsValue, bundleCost, splitBundlePrice } from "@/lib/bundle";
import { BundleForm } from "@/components/BundleForm";
import { createBundle, toggleBundle } from "./actions";

export const dynamic = "force-dynamic";

type VariantRow = {
  id: string;
  variant_name: string | null;
  sale_price: number | null;
  cost_price: number | null;
  products: { name: string | null; name_ar: string | null } | null;
};

type BundleRow = {
  id: string;
  name: string;
  price: number;
  note: string | null;
  active: boolean;
  bundle_items: { variant_id: string; quantity: number }[];
};

/**
 * الباقات والأطقم.
 *
 * ⚠️⚠️ **الباقة وصفة مش منتج.** بنودها أشكال حقيقية، ولما تتباع بتتحوّل
 * لبنود أوردر عادية بسعر موزّع — فالمخزون والأرباح ونسب الرجوع بتفضل صح
 * لوحدها. لو اتسجّلت كمنتج واحد، المخزون مابينقصش والربح بيتحسب على تكلفة
 * وهمية.
 */
export default async function BundlesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const me = await requirePagePermission("products.view");
  const canEdit = can(me, "products.edit");
  const db = createAdminClient();

  const [{ data: variantRows }, { data: bundleRows, error: bundleError }] =
    await Promise.all([
      db
        .from("product_variants")
        .select("id, variant_name, sale_price, cost_price, products(name, name_ar)")
        // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد المنع
        .eq("tenant_id", me.tenantId)
        .order("variant_name")
        .limit(500)
        .overrideTypes<VariantRow[]>(),
      db
        .from("bundles")
        .select("id, name, price, note, active, bundle_items(variant_id, quantity)")
        .eq("tenant_id", me.tenantId)
        .order("created_at", { ascending: false })
        .limit(200)
        .overrideTypes<BundleRow[]>(),
    ]);

  // الجدول لسه مااتعملش؟ الصفحة بتقول الحل بدل ما توقع
  if (bundleError) {
    return (
      <div className="space-y-4">
        <BackLink href="/products" label="المنتجات" />
        <h1 className="text-2xl font-bold text-gray-900">الباقات</h1>
        <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">الصفحة محتاجة جدولين في الداتابيز الأول.</p>
          <p className="mt-1">
            افتح Supabase ← SQL Editor وشغّل <code>sql/bundles.sql</code>، وبعدها
            افتح الصفحة دي تاني.
          </p>
          <p className="mt-2 text-xs text-amber-700">({bundleError.message})</p>
        </div>
      </div>
    );
  }

  const variants = (variantRows ?? []).map((v) => ({
    id: v.id,
    name:
      [v.products?.name_ar ?? v.products?.name, v.variant_name]
        .filter(Boolean)
        .join(" · ") || "بدون اسم",
    price: Number(v.sale_price ?? 0),
    cost: Number(v.cost_price ?? 0),
  }));

  const byId = new Map(variants.map((v) => [v.id, v]));

  const bundles = (bundleRows ?? []).map((b) => {
    const items = (b.bundle_items ?? []).map((i) => {
      const v = byId.get(i.variant_id);
      return {
        variantId: i.variant_id,
        name: v?.name ?? "منتج اتمسح",
        quantity: i.quantity,
        unitPrice: v?.price ?? 0,
        unitCost: v?.cost ?? 0,
      };
    });
    const full = itemsValue(items);
    return {
      ...b,
      items,
      full,
      cost: bundleCost(items),
      lines: splitBundlePrice({ name: b.name, price: b.price, items }),
    };
  });

  return (
    <div className="space-y-4">
      <BackLink href="/products" label="المنتجات" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">الباقات</h1>
        {bundles.length > 0 && (
          <span className="text-xs text-gray-500">{bundles.length} باقة</span>
        )}
      </div>

      <p className="text-sm text-gray-500">
        كذا منتج بسعر واحد. لما الباقة تتباع، بنودها بتتسجّل منتجات عادية
        بسعر موزّع عليها — فالمخزون بينقص صح والأرباح بتتحسب صح.
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
          {saved}
        </p>
      )}

      {canEdit && variants.length >= 2 && (
        <BundleForm variants={variants} create={createBundle} />
      )}

      {bundles.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مافيش باقات لسه.
        </p>
      ) : (
        <div className="space-y-2">
          {bundles.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl bg-white p-4 shadow-sm sm:p-5 ${
                b.active ? "" : "opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">
                  {b.name}
                  {!b.active && (
                    <span className="mr-2 text-xs text-gray-400">— مقفولة</span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-gray-900">
                  {formatMoney(Math.round(b.price))}
                  {b.full > b.price && (
                    <span className="mr-2 text-xs font-normal text-gray-400 line-through">
                      {formatMoney(Math.round(b.full))}
                    </span>
                  )}
                </span>
              </div>

              {b.note && (
                <p className="mt-0.5 text-[11px] text-gray-400">{b.note}</p>
              )}

              <div className="mt-3 space-y-1">
                {b.lines.map((l) => (
                  <div
                    key={l.variantId}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="text-gray-600">
                      {l.quantity > 1 && `${l.quantity} × `}
                      {l.name}
                    </span>
                    <span className="tabular-nums text-gray-400">
                      {formatMoney(Math.round(l.salePrice * l.quantity))}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-3">
                <span className="text-[11px] text-gray-400">
                  العميل بيوفّر {formatMoney(Math.round(Math.max(0, b.full - b.price)))}
                  {b.cost > 0 &&
                    ` · ربحك ${formatMoney(Math.round(b.price - b.cost))}`}
                </span>

                {canEdit && (
                  <form action={toggleBundle}>
                    <input type="hidden" name="bundle_id" value={b.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={b.active ? "0" : "1"}
                    />
                    <button className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">
                      {b.active ? "اقفلها" : "افتحها"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

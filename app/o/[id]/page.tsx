import { createAdminClient } from "@/lib/supabase/admin";
import { storeWordmark } from "@/lib/tracking-view";
import { LinkOrderForm, type LinkItem } from "@/components/LinkOrderForm";
import { submitLinkOrder } from "./actions";

export const dynamic = "force-dynamic";

/**
 * صفحة الطلب اللي العميل بيفتحها من اللينك.
 *
 * ⚠️⚠️ **مفتوحة من غير حساب** (مستثناة في `lib/supabase/middleware.ts`).
 *
 * ⚠️ **واللي بيتعرض هو المنتجات وأسعارها وبس** — مافيش أي حاجة عن المتجر ولا
 * عن عملاء تانيين. والأسعار بتتقرا من الداتابيز مش من اللينك.
 *
 * ⚠️ **والأسماء إنجليزي** — أسماء شوبيفاي هي اللي العميل شافها وهو بيشتري،
 * والاسم العربي بتاعنا داخلي.
 */
export default async function OrderLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const linkId = decodeURIComponent(String(id ?? "")).trim();

  const db = createAdminClient();
  const { data } = await db
    .from("order_links")
    .select(
      `active, tenant_id, title, variant_id,
       tenants(name, slug),
       order_link_items(variant_id)`
    )
    .eq("id", linkId)
    .maybeSingle();

  const row = data as {
    active: boolean;
    tenant_id: string;
    title: string | null;
    variant_id: string | null;
    tenants: { name: string | null; slug: string | null } | null;
    order_link_items: { variant_id: string }[] | null;
  } | null;

  if (!row) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-bold text-gray-900">اللينك ده مش موجود</h1>
        <p className="mt-2 text-sm text-gray-500">
          اتأكد من اللينك، ولو لسه مش شغّال كلّم المتجر.
        </p>
      </div>
    );
  }

  // ⚠️ اللينكات القديمة عندها شكل واحد في `variant_id` بدل الجدول
  const ids = [
    ...new Set(
      (row.order_link_items ?? [])
        .map((i) => i.variant_id)
        .concat(row.variant_id ? [row.variant_id] : [])
    ),
  ];

  const [{ data: variants }, { data: creds }] = await Promise.all([
    ids.length > 0
      ? db
          .from("product_variants")
          .select("id, variant_name, sale_price, products(name, name_ar, image_url)")
          .in("id", ids)
      : Promise.resolve({ data: [] }),
    db
      .from("tenant_credentials")
      .select("flat_shipping_price")
      .eq("tenant_id", row.tenant_id)
      .maybeSingle(),
  ]);

  const items: LinkItem[] = (
    (variants ?? []) as unknown as {
      id: string;
      variant_name: string | null;
      sale_price: number;
      products: {
        name: string | null;
        name_ar: string | null;
        image_url: string | null;
      } | null;
    }[]
  ).map((v) => {
    // ⚠️ اسم شوبيفاي الأول — ده اللي العميل شافه وهو بيشتري
    const base = v.products?.name || v.products?.name_ar || "Item";
    const extra = String(v.variant_name ?? "").trim();
    const skip = extra.toLowerCase() === "default title";
    return {
      variantId: v.id,
      title: extra && !skip ? `${base} — ${extra}` : base,
      price: Number(v.sale_price ?? 0),
      image: v.products?.image_url ?? null,
    };
  });

  const shipping =
    Number(
      (creds as { flat_shipping_price: number | null } | null)?.flat_shipping_price ?? 0
    ) || 0;

  const store = storeWordmark(row.tenants?.name, row.tenants?.slug);

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      {store && (
        <p className="text-center text-xs font-light tracking-[0.2em] text-gray-500">
          {store}
        </p>
      )}

      {row.title && (
        <h1 className="mt-4 text-center text-lg font-bold text-gray-900">
          {row.title}
        </h1>
      )}

      {!row.active ? (
        <p className="mt-8 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          العرض ده خلص. كلّم المتجر لو لسه عايزه.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-8 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          مفيش منتجات في اللينك ده.
        </p>
      ) : (
        <LinkOrderForm
          linkId={linkId}
          items={items}
          shipping={shipping}
          action={submitLinkOrder}
        />
      )}
    </div>
  );
}

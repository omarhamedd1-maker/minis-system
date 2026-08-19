import { createAdminClient } from "@/lib/supabase/admin";
import { storeWordmark } from "@/lib/tracking-view";
import { LinkOrderForm } from "@/components/LinkOrderForm";
import { submitLinkOrder } from "./actions";

export const dynamic = "force-dynamic";

/**
 * صفحة الطلب اللي العميل بيفتحها من اللينك.
 *
 * ⚠️⚠️ **مفتوحة من غير حساب** (مستثناة في `lib/supabase/middleware.ts`) —
 * العميل مالوش حساب عندنا.
 *
 * ⚠️ **واللي بيتعرض هو المنتج وسعره وبس** — مافيش أي حاجة عن المتجر ولا عن
 * عملاء تانيين. والسعر بيتقرا من الداتابيز مش من اللينك.
 *
 * ⚠️ **واللينك المقفول بيدّي صفحة بتقول كده** — مش صفحة مكسورة. اللينكات
 * بتتبعت في رسايل وبتفضل موجودة بعد ما العرض يخلص.
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
      `active,
       tenants(name, slug),
       product_variants(sale_price, variant_name, products(name, name_ar, image_url))`
    )
    .eq("id", linkId)
    .maybeSingle();

  const row = data as {
    active: boolean;
    tenants: { name: string | null; slug: string | null } | null;
    product_variants: {
      sale_price: number;
      variant_name: string | null;
      products: {
        name: string | null;
        name_ar: string | null;
        image_url: string | null;
      } | null;
    } | null;
  } | null;

  const store = storeWordmark(row?.tenants?.name, row?.tenants?.slug);
  const variant = row?.product_variants ?? null;

  if (!row || !variant) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-bold text-gray-900">اللينك ده مش موجود</h1>
        <p className="mt-2 text-sm text-gray-500">
          اتأكد من اللينك، ولو لسه مش شغّال كلّم المتجر.
        </p>
      </div>
    );
  }

  const base = variant.products?.name_ar || variant.products?.name || "منتج";
  const extra = String(variant.variant_name ?? "").trim();
  const title =
    extra && extra.toLowerCase() !== "default title" ? `${base} — ${extra}` : base;
  const image = variant.products?.image_url ?? null;

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      {store && (
        <p className="text-center text-xs font-light tracking-[0.2em] text-gray-500">
          {store}
        </p>
      )}

      {image && (
        // ⚠️ صورة شوبيفاي — `img` عادي عشان الدومين مش لازم يتسجّل في الإعدادات
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={title}
          className="mt-6 aspect-square w-full rounded-2xl bg-gray-50 object-cover"
        />
      )}

      <h1 className="mt-6 text-center text-xl font-bold text-gray-900">
        {title}
      </h1>
      <p className="mt-1 text-center text-2xl font-bold tabular-nums text-gray-900">
        {Math.round(variant.sale_price).toLocaleString("ar-EG")} جنيه
      </p>

      {!row.active ? (
        <p className="mt-8 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          العرض ده خلص. كلّم المتجر لو لسه عايزه.
        </p>
      ) : (
        <LinkOrderForm
          linkId={linkId}
          price={variant.sale_price}
          action={submitLinkOrder}
        />
      )}
    </div>
  );
}

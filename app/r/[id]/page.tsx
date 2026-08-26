import { createAdminClient } from "@/lib/supabase/admin";
import { looksLikeOrderId, storeWordmark } from "@/lib/tracking-view";
import { RatingStars } from "@/components/RatingStars";
import { saveRating } from "./actions";

export const dynamic = "force-dynamic";

/**
 * صفحة التقييم اللي العميل بيفتحها.
 *
 * ⚠️⚠️ **مفتوحة من غير حساب بقصد** (مستثناة في `lib/supabase/middleware.ts`)
 * — العميل مالوش حساب عندنا، وأي تسجيل دخول = صفر تقييمات.
 *
 * ⚠️ **ومافيش أي بيانات بتتعرض** — لا اسم ولا تليفون ولا عنوان ولا مبلغ.
 * اللينك اللي يوصل لحد تاني مايوصّلش لبيانات حد.
 *
 * ⚠️ **وإنجليزي** زي صفحة التتبع — نفس العميل ونفس الرسالة.
 */
export default async function RatingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  const id = decodeURIComponent(String(raw ?? "")).trim();

  const db = createAdminClient();

  const { data } = looksLikeOrderId(id)
    ? await db
        .from("orders")
        .select("id, order_status, tenants(name, slug), order_ratings(stars)")
        .eq("id", id)
        .limit(1)
        .maybeSingle()
    : { data: null };

  const row = data as {
    id: string;
    order_status: string | null;
    tenants: { name: string | null; slug: string | null } | null;
    order_ratings: { stars: number }[] | null;
  } | null;

  const store = storeWordmark(row?.tenants?.name, row?.tenants?.slug);
  const already = (row?.order_ratings ?? []).length > 0;

  return (
    <div className="mx-auto max-w-md px-6 py-16" dir="ltr">
      {store && (
        <p className="text-sm font-light tracking-[0.2em] text-gray-900">
          {store}
        </p>
      )}

      {!row ? (
        // ⚠️ **مانقولش «اللينك ده مش موجود»** بشكل بيفرّق بين لينك حقيقي وغلط
        <>
          <h1 className="mt-6 text-3xl font-bold leading-tight text-gray-900">
            This link isn&apos;t working
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Double-check the link from your message.
          </p>
        </>
      ) : already ? (
        <>
          <h1 className="mt-6 text-3xl font-bold leading-tight text-gray-900">
            Thank you
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            You&apos;ve already rated this order.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-3xl font-bold leading-tight text-gray-900">
            How was your order?
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            It takes a second, and it helps us a lot.
          </p>

          <RatingStars orderId={row.id} save={saveRating} />
        </>
      )}
    </div>
  );
}

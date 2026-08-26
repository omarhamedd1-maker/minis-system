import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import {
  ratingsByProduct,
  overallRating,
  starsText,
  MIN_RATINGS,
  LOW_STARS,
  type Rating,
} from "@/lib/rating";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  order_id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  orders: {
    order_number: string | null;
    customers: { full_name: string | null } | null;
    order_items: {
      variant_id: string | null;
      product_variants: {
        variant_name: string | null;
        products: { name: string | null; name_ar: string | null } | null;
      } | null;
    }[];
  } | null;
};

/**
 * التقييمات بعد التسليم.
 *
 * ⚠️⚠️ **التقييم بيتربط بالمنتج مش بالأوردر بس** — «العميل مبسوط» رقم
 * مالوش فايدة؛ «الشكل ده متوسطه ٢٫١ من ١٤ تقييم» رقم بيتعمل عليه حاجة.
 */
export default async function RatingsPage() {
  await requirePagePermission("orders.view");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("order_ratings")
    .select(
      `id, order_id, stars, comment, created_at,
       orders(order_number, customers(full_name),
         order_items(variant_id,
           product_variants(variant_name, products(name, name_ar))))`
    )
    .order("created_at", { ascending: false })
    .limit(1000)
    .overrideTypes<Row[]>();

  // الجدول لسه مااتعملش؟ الصفحة بتقول الحل بدل ما توقع
  if (error) {
    return (
      <div className="space-y-4">
        <BackLink href="/orders" label="الأوردرات" />
        <h1 className="text-2xl font-bold text-gray-900">التقييمات</h1>
        <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">الصفحة محتاجة جدول في الداتابيز الأول.</p>
          <p className="mt-1">
            افتح Supabase ← SQL Editor وشغّل <code>sql/ratings.sql</code>،
            وبعدها افتح الصفحة دي تاني.
          </p>
          <p className="mt-2 text-xs text-amber-700">({error.message})</p>
        </div>
      </div>
    );
  }

  const rows = data ?? [];

  const nameOf = new Map<string, string>();
  const ratings: Rating[] = rows.map((r) => {
    const ids: string[] = [];
    for (const i of r.orders?.order_items ?? []) {
      if (!i.variant_id) continue;
      ids.push(i.variant_id);
      nameOf.set(
        i.variant_id,
        [
          i.product_variants?.products?.name_ar ??
            i.product_variants?.products?.name,
          i.product_variants?.variant_name,
        ]
          .filter(Boolean)
          .join(" · ") || "شكل"
      );
    }
    return {
      orderId: r.order_id,
      stars: r.stars,
      comment: r.comment,
      variantIds: ids,
      createdAt: r.created_at,
    };
  });

  const overall = overallRating(ratings);
  const byProduct = ratingsByProduct(ratings);
  const withComments = rows.filter((r) => String(r.comment ?? "").trim());

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">التقييمات</h1>
        <span className="text-xs text-gray-500">{overall.count} تقييم</span>
      </div>

      {overall.count === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مافيش تقييمات لسه. لينك التقييم بيتبعت مع رسالة «اسأل بعد التسليم» —
          حطّ <code>{"{لينك التقييم}"}</code> في القالب.
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-gray-500">المتوسط العام</span>
              <span className="text-lg font-bold tabular-nums text-gray-900">
                {overall.average === null ? (
                  <span className="text-sm font-normal text-gray-400">
                    لسه بدري — {overall.count} من {MIN_RATINGS}
                  </span>
                ) : (
                  <>
                    <span className="text-amber-400">
                      {starsText(overall.average)}
                    </span>{" "}
                    {overall.average}
                  </>
                )}
              </span>
            </div>
            {overall.lowRate !== null && overall.low > 0 && (
              <p className="mt-1 text-[11px] text-gray-400">
                {overall.low} تقييم تحت {LOW_STARS} نجوم ({overall.lowRate}%)
              </p>
            )}
          </div>

          {/*
            ⚠️⚠️ **الأوردر بيقيّم كل أشكاله بنفس النجوم.** العميل بيقيّم
            تجربته مش كل منتج لوحده — فالرقم ده تقريب، ومذكور هنا عشان
            يتقرا صح.
          */}
          <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-bold text-gray-900">بالمنتج</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              الأقل الأول. والأوردر اللي فيه كذا منتج بيدّي نفس النجوم لكلهم —
              العميل بيقيّم تجربته مش كل حاجة لوحدها.
            </p>
            <div className="mt-3 space-y-1.5">
              {byProduct.map((p) => (
                <div
                  key={p.variantId}
                  className="flex flex-wrap items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-gray-900">
                    {nameOf.get(p.variantId) ?? "شكل اتمسح"}
                  </span>
                  <span className="text-xs tabular-nums text-gray-500">
                    {p.average === null ? (
                      <span className="text-gray-300">
                        {p.count} تقييم — لسه بدري
                      </span>
                    ) : (
                      <>
                        <span
                          className={
                            p.average < LOW_STARS
                              ? "text-red-600"
                              : "text-amber-500"
                          }
                        >
                          {starsText(p.average)}
                        </span>{" "}
                        {p.average}
                        <span className="mr-2 text-gray-300">
                          {p.count} تقييم
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {withComments.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-sm font-bold text-gray-900">اللي كتبوا</h2>
              <div className="mt-3 space-y-3">
                {withComments.slice(0, 30).map((r) => (
                  <div
                    key={r.id}
                    className="border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        href={`/orders/${r.order_id}`}
                        className="text-sm text-gray-900 hover:underline"
                      >
                        #{r.orders?.order_number ?? "؟"} ·{" "}
                        {r.orders?.customers?.full_name ?? "بدون اسم"}
                      </Link>
                      <span
                        className={`text-xs ${
                          r.stars < LOW_STARS ? "text-red-600" : "text-amber-500"
                        }`}
                      >
                        {starsText(r.stars)}
                      </span>
                    </div>
                    <p
                      className="mt-1 text-sm leading-relaxed text-gray-600"
                      dir="auto"
                    >
                      {r.comment}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-300">
                      {formatDate(r.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

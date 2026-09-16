import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { orderMap, MIN_FOR_RATE } from "@/lib/order-map";
import { allRows } from "@/lib/fetch-all-pages";

export const dynamic = "force-dynamic";

type Row = {
  order_status: string | null;
  discount: number | null;
  shipping_price: number | null;
  customers: { address: string | null } | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

/**
 * بتبيع فين فعلًا.
 *
 * ⚠️⚠️ **المنطقة بتتقرا من العنوان مش من خانة «المدينة».** خانة المدينة
 * فاضية في ٣٠٧ من ٣٠٨ عملاء — أي تقسيم مبني عليها بيطلع صفحة فاضية.
 * العنوان نفسه مكتوب في ٣٢٣ من ٣٢٤ أوردر وجوّاه المنطقة.
 *
 * ⚠️ **واللي معرفناش منطقته بيتعرض لوحده** — التوزيع على الباقي بيكبّر
 * أرقام كل منطقة من غير ما حد ياخد باله.
 */
export default async function OrderMapPage() {
  await requirePagePermission("finance.dashboard");
  const supabase = await createClient();

  const { data, error } = await allRows(supabase
    .from("orders")
    .select(
      `order_status, discount, shipping_price,
       customers(address),
       order_items(quantity, sale_price_at_order)`
    )
    .eq("archived", false)
    .overrideTypes<Row[]>());

  if (error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        معرفناش نقرا الأوردرات: {error.message}
      </div>
    );
  }

  const map = orderMap(
    (data ?? []).map((o) => ({
      address: o.customers?.address ?? null,
      orderStatus: o.order_status,
      total:
        (o.order_items ?? []).reduce(
          (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
          0
        ) -
        Number(o.discount ?? 0) +
        Number(o.shipping_price ?? 0),
    }))
  );

  const most = map.rows[0]?.orders ?? 1;

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">بتبيع فين</h1>
        {map.unknown > 0 && (
          <span className="text-xs text-ink-faint">
            {map.unknown} عنوان معرفناش منطقته
          </span>
        )}
      </div>

      {map.rows.length === 0 ? (
        <p className="card empty">
          مافيش عناوين نقدر نقرا منها مناطق لسه.
        </p>
      ) : (
        <>
          {/*
            ⚠️⚠️ **المنطقة اللي بتبيع فيها أكتر ممكن تكون هي اللي بترجّع
            أكتر كمان.** الرقمين لازم يتشافوا سوا، لأن «أحسن منطقة» بالمبيعات
            بتبقى أوحش منطقة بالصافي لو نُص شحناتها بترجع.
          */}
          {map.worst && map.top && (
            <p className="card p-4 text-sm leading-relaxed text-ink-muted sm:p-5">
              {map.worst.area === map.top.area ? (
                <>
                  <span className="font-medium text-ink">
                    {map.top.area}
                  </span>{" "}
                  أكتر منطقة بتبيع فيها ({map.top.orders} أوردر) — وهي كمان أعلى
                  منطقة في الرجوع ({map.worst.returnRate}%).
                </>
              ) : (
                <>
                  أكتر منطقة بتبيع فيها{" "}
                  <span className="font-medium text-ink">
                    {map.top.area}
                  </span>{" "}
                  ({map.top.orders} أوردر)، وأعلى منطقة في الرجوع{" "}
                  <span className="font-medium text-ink">
                    {map.worst.area}
                  </span>{" "}
                  ({map.worst.returnRate}%).
                </>
              )}
            </p>
          )}

          <div className="card p-4 sm:p-5">
            <div className="space-y-3">
              {map.rows.map((r) => (
                <div key={r.area}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ink">{r.area}</span>
                    <span className="text-xs tabular-nums text-ink-muted">
                      {r.orders} أوردر · {formatMoney(Math.round(r.delivered))}
                      {r.returnRate !== null && (
                        <span
                          className={
                            r.returnRate >= 20
                              ? " text-danger"
                              : " text-ink-faint"
                          }
                        >
                          {" · رجع "}
                          {r.returnRate}%
                        </span>
                      )}
                    </span>
                  </div>
                  {/* شريط بسيط — الطول نسبة لأكبر منطقة */}
                  <div className="mt-1 h-1.5 w-full rounded-full bg-sunken">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.round((r.orders / most) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
              الفلوس هي اللي وصل فعلًا. ونسبة الرجوع مابتتعرضش للمنطقة اللي
              خلص فيها أقل من {MIN_FOR_RATE} أوردر — أوردرين رجع منهم واحد
              مش ٥٠٪.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

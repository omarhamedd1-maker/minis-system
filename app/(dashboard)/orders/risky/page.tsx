import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { orderFlags, worthChecking, flagLine } from "@/lib/order-flags";
import { whatsappLink } from "@/lib/followup";

export const dynamic = "force-dynamic";

/** الحالات اللي لسه ينفع تتصرّف فيها — بعد الشحن الكلام عدّى */
const BEFORE_SHIPPING = ["new", "confirmed", "packed"];
const RETURNED = ["returned", "returned_after_delivery"];
const SETTLED = ["delivered", "returned", "returned_after_delivery"];

type Row = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  discount: number | null;
  shipping_price: number | null;
  customer_id: string | null;
  customers: {
    full_name: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

/**
 * الأوردرات اللي تستاهل مكالمة قبل ما تروح لبوسطة.
 *
 * ⚠️⚠️ **دي تنبيهات مش موانع.** الأوردر بيفضل يتشحن عادي، والقايمة دي
 * بتقول «بصّ على دول الأول» — عميل رجّع مرة ممكن يكون العيب كان في الشحنة،
 * والأوردر الكبير من عميل جديد ممكن يكون أحسن بيعة في الشهر.
 *
 * ⚠️ **والعنوان القصير لوحده مش سبب.** بيرن على نُص الأوردرات، فلو دخل
 * القايمة تبقى هي قايمة الأوردرات كلها.
 */
export default async function RiskyPage() {
  await requirePagePermission("orders.view");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, order_date, discount, shipping_price,
       customer_id, customers(full_name, phone, address),
       order_items(quantity, sale_price_at_order)`
    )
    .in("order_status", BEFORE_SHIPPING)
    .eq("archived", false)
    .order("order_date", { ascending: false })
    .limit(300)
    .overrideTypes<Row[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        معرفناش نقرا الأوردرات: {error.message}
      </div>
    );
  }

  const rows = data ?? [];

  /**
   * تاريخ العملاء دول — استعلام واحد لكلهم.
   *
   * ⚠️ **استعلام لكل أوردر كان هيخلّي الصفحة تفتح في تانية لكل ٣٠ أوردر.**
   */
  const customerIds = [...new Set(rows.map((o) => o.customer_id).filter(Boolean))];
  const { data: history } = customerIds.length
    ? await supabase
        .from("orders")
        .select("customer_id, order_status")
        .in("customer_id", customerIds as string[])
        .limit(3000)
    : { data: [] };

  const past = new Map<
    string,
    { settled: number; returned: number; cancelled: number }
  >();
  for (const h of (history ?? []) as {
    customer_id: string | null;
    order_status: string | null;
  }[]) {
    if (!h.customer_id) continue;
    const cur = past.get(h.customer_id) ?? { settled: 0, returned: 0, cancelled: 0 };
    const s = String(h.order_status);
    if (SETTLED.includes(s)) cur.settled++;
    if (RETURNED.includes(s)) cur.returned++;
    if (s === "cancelled") cur.cancelled++;
    past.set(h.customer_id, cur);
  }

  /**
   * نفس التليفون كام مرة في نفس اليوم.
   *
   * ⚠️ **بالتليفون مش بالعنوان** — العنوان بيتكتب بألف طريقة، والمقارنة
   * حرف بحرف بتفوّت أغلب التكرار.
   */
  const sameDay = new Map<string, number>();
  for (const o of rows) {
    const phone = String(o.customers?.phone ?? "").trim();
    const day = String(o.order_date ?? "").slice(0, 10);
    if (!phone || !day) continue;
    const key = `${phone}|${day}`;
    sameDay.set(key, (sameDay.get(key) ?? 0) + 1);
  }

  const flagged = rows
    .map((o) => {
      const total =
        (o.order_items ?? []).reduce(
          (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
          0
        ) -
        Number(o.discount ?? 0) +
        Number(o.shipping_price ?? 0);

      const h = o.customer_id ? past.get(o.customer_id) : undefined;
      const phone = String(o.customers?.phone ?? "").trim();
      const day = String(o.order_date ?? "").slice(0, 10);
      const others = Math.max(0, (sameDay.get(`${phone}|${day}`) ?? 1) - 1);

      const flags = orderFlags({
        orderStatus: o.order_status,
        total,
        address: o.customers?.address ?? null,
        previousOrders: h?.settled ?? 0,
        previousReturns: h?.returned ?? 0,
        previousCancels: h?.cancelled ?? 0,
        sameDayOthers: others,
      });

      return { order: o, total, flags };
    })
    .filter((x) => worthChecking(x.flags));

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">أوردرات محتاجة نظرة</h1>
        {flagged.length > 0 && (
          <span className="text-xs text-gray-500">
            {flagged.length} من {rows.length} لسه مااتشحنوش
          </span>
        )}
      </div>

      <p className="text-sm text-gray-500">
        دي مش أوردرات غلط — دي أوردرات وراها حاجة في تاريخها. مكالمة قبل الشحن
        بتوفّر شحنة رايحة جاية، والقرار قرارك.
      </p>

      {flagged.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مافيش أوردر محتاج وقفة دلوقتي.
        </p>
      ) : (
        <div className="space-y-2">
          {flagged.map(({ order: o, total, flags }) => (
            <div key={o.id} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/orders/${o.id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {o.customers?.full_name ?? "بدون اسم"}
                </Link>
                <span className="text-xs text-gray-500">
                  #{o.order_number} · {formatMoney(Math.round(total))}
                </span>
              </div>

              <p className="mt-1 text-sm text-amber-700" dir="auto">
                {flagLine(flags)}
              </p>

              {o.customers?.phone && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={`tel:${o.customers.phone}`}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
                  >
                    اتصل
                  </a>
                  <a
                    href={whatsappLink(
                      o.customers.phone,
                      `أهلًا${
                        o.customers.full_name
                          ? " " + o.customers.full_name.split(" ")[0]
                          : ""
                      } — بنأكّد أوردرك رقم ${o.order_number ?? ""} قبل ما نشحنه.`
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    واتساب
                  </a>
                  <span className="text-xs text-gray-400" dir="ltr">
                    {o.customers.phone}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

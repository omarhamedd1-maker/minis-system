import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission, can } from "@/lib/permissions";
import {
  followupQueue,
  whatsappLink,
  ASK_AFTER_DAYS,
  ASK_BEFORE_DAYS,
} from "@/lib/followup";
import { markFollowedUp } from "./actions";

export const dynamic = "force-dynamic";

/**
 * اسأل بعد التسليم.
 *
 * ⚠️⚠️ **مافيش إرسال تلقائي.** الصفحة بتقول مين يتكلّم والنص الجاهز، والزرار
 * بيفتح واتساب على المحادثة والرسالة مكتوبة. الرسالة اللي بتروح لوحدها لعميل
 * مالهوش دعوة أوحش من إنها ماتروحش.
 */
export default async function FollowupPage() {
  const user = await requirePagePermission("orders.view");
  const canMark = can(user, "orders.status");
  const supabase = await createClient();

  type Row = {
    id: string;
    order_number: string | null;
    order_status: string | null;
    delivered_at: string | null;
    followed_up_at: string | null;
    customers: { full_name: string | null; phone: string | null } | null;
    order_items: {
      product_variants: {
        products: { name_ar: string | null; name: string | null } | null;
      } | null;
    }[];
  };

  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, delivered_at, followed_up_at,
       customers(full_name, phone),
       order_items(product_variants(products(name_ar, name)))`
    )
    .eq("order_status", "delivered")
    .is("followed_up_at", null)
    .order("delivered_at", { ascending: true })
    .limit(500)
    .overrideTypes<Row[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {/* الخانة لسه مااتعملتش؟ ده بيبان هنا بدل ما الصفحة تقع */}
        معرفناش نقرا الأوردرات: {error.message}
      </div>
    );
  }

  const queue = followupQueue(
    (data ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      orderStatus: o.order_status,
      deliveredAt: o.delivered_at,
      followedUpAt: o.followed_up_at,
      customerName: o.customers?.full_name ?? null,
      customerPhone: o.customers?.phone ?? null,
      products: [
        ...new Set(
          (o.order_items ?? []).map(
            (i) =>
              i.product_variants?.products?.name_ar ||
              i.product_variants?.products?.name ||
              ""
          )
        ),
      ].filter(Boolean),
    })),
    new Date()
  );

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">اسأل بعد التسليم</h1>
        <span className="text-xs text-gray-500">{queue.length} عميل</span>
      </div>

      <p className="text-sm text-gray-500">
        العميل اللي عنده مشكلة بيسكت وبعدين يعمل مرتجع. السؤال بعد{" "}
        {ASK_AFTER_DAYS} أيام بيخلّي المشكلة توصلك قبل ما تتحوّل لشحنة عكسية.
        بعد {ASK_BEFORE_DAYS} أيام بيخرج من القايمة — السؤال ساعتها اتأخّر.
      </p>

      {queue.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مفيش حد مستني سؤال دلوقتي.
        </p>
      ) : (
        <div className="space-y-2">
          {queue.map((r) => (
            <div
              key={r.id}
              className="rounded-xl bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">
                  {r.customerName ?? "بدون اسم"}
                </span>
                <span className="text-xs text-gray-500">
                  #{r.orderNumber} · اتسلّم من {r.days} يوم
                </span>
              </div>

              <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {r.message}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={whatsappLink(r.customerPhone, r.message)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  افتح واتساب
                </a>
                {canMark && (
                  <form action={markFollowedUp}>
                    <input type="hidden" name="orderId" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-lg bg-white px-4 py-1.5 text-sm text-gray-600 shadow-sm hover:bg-gray-100"
                    >
                      اتسأل خلاص
                    </button>
                  </form>
                )}
                <span className="text-xs text-gray-400" dir="ltr">
                  {r.customerPhone}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

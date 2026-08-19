import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { rescueQueue, rescueValue, RESCUE_WINDOW_DAYS } from "@/lib/rescue";
import { whatsappLink } from "@/lib/followup";

export const dynamic = "force-dynamic";

/**
 * شحنات لسه ينفع تتنقذ.
 *
 * ⚠️ **التنبيه على المحاولة الفاشلة موجود من قبل كده** وبيوصل على الموبايل.
 * الناقص كان **القايمة** — تجمعهم في مكان واحد بدل ما تدوّر في الإشعارات.
 *
 * ⚠️⚠️ **والوقت ضيق**: بوسطة بتحاول تاني بعد يوم أو يومين وبعدها بترجّع،
 * فالترتيب هنا **بالأحدث** — عكس باقي القوايم بقصد.
 */
export default async function RescuePage() {
  await requirePagePermission("orders.view");
  const supabase = await createClient();

  type Row = {
    id: string;
    order_number: string | null;
    order_status: string | null;
    bosta_exception: string | null;
    bosta_cod: number | null;
    updated_at?: string | null;
    bosta_created_at: string | null;
    customers: { full_name: string | null; phone: string | null } | null;
  };

  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, bosta_exception, bosta_cod, bosta_created_at,
       customers(full_name, phone)`
    )
    .in("order_status", ["shipped", "out_for_delivery", "awaiting_action"])
    .eq("archived", false)
    .limit(500)
    .overrideTypes<Row[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        معرفناش نقرا الأوردرات: {error.message}
      </div>
    );
  }

  const queue = rescueQueue(
    (data ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      orderStatus: o.order_status,
      exception: o.bosta_exception,
      // ⚠️ مافيش عمود بيسجّل وقت آخر محاولة، فبنستخدم تاريخ الشحنة كتقريب.
      // النتيجة إن المدة بتبان **أطول** من الحقيقة — يعني الفلتر بيشيل
      // سطور كان ممكن تفضل، وده أأمن من إنه يسيب سطور فات وقتها.
      lastMoveAt: o.bosta_created_at,
      customerName: o.customers?.full_name ?? null,
      customerPhone: o.customers?.phone ?? null,
      cod: o.bosta_cod,
    })),
    new Date()
  );

  const total = rescueValue(queue);

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">اتصل قبل ما ترجع</h1>
        {queue.length > 0 && (
          <span className="text-xs text-gray-500">
            {queue.length} شحنة · {formatMoney(Math.round(total))}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-500">
        بوسطة بتحاول تلات مرات وبعدين بترجّع. أكبر سببين للرجوع عندك هما «رفض
        يستلم» و«طلب التأجيل» — والاتنين مكالمة بتقلبهم. اللي عدّى على محاولته
        أكتر من {RESCUE_WINDOW_DAYS} أيام بيخرج من القايمة، فات وقته.
      </p>

      {queue.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مافيش شحنة واقفة دلوقتي.
        </p>
      ) : (
        <div className="space-y-2">
          {queue.map((r) => (
            <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/orders/${r.id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {r.customerName ?? "بدون اسم"}
                </Link>
                <span className="text-xs text-gray-500">
                  #{r.orderNumber}
                  {r.cod > 0 && ` · ${formatMoney(r.cod)}`}
                </span>
              </div>

              <p
                className={`mt-1 text-sm ${
                  r.waiting ? "text-red-600" : "text-amber-700"
                }`}
                dir="auto"
              >
                {r.reason}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`tel:${r.customerPhone}`}
                  className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                >
                  اتصل
                </a>
                <a
                  href={whatsappLink(
                    r.customerPhone,
                    `أهلًا${r.customerName ? " " + r.customerName.split(" ")[0] : ""} — بخصوص شحنتك اللي مع المندوب، إمتى يناسبك نبعتها؟`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  واتساب
                </a>
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

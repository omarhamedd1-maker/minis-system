import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { cairoToday, formatMoney } from "@/lib/format";
import { requirePagePermission } from "@/lib/permissions";
import {
  overallAov,
  segmentCustomers,
  statsByCustomer,
  type SegOrder,
} from "@/lib/customer-segments";

export const dynamic = "force-dynamic";

/**
 * شرايح العملاء.
 *
 * «٢٩٨ عميل» رقم مابيقولش حاجة. الصفحة دي بتقول مين فيهم يستاهل معاملة
 * مختلفة — واللي جنب كل شريحة هو **إيه المختلف معاها**، لأن الشريحة من
 * غير تصرّف مالهاش لازمة.
 */
export default async function SegmentsPage() {
  const me = await requirePagePermission("customers.view");

  // ⚠️ **اتصال محمي بالـRLS، مش مفتاح الأدمن** (بند ٢.٦).
  //
  // مفتاح الأدمن بيعدّي فوق قواعد المنع، فالفلتر على البيزنس بيبقى علينا
  // نفتكره. الاتصال ده بيمشي بجلسة المستخدم فالداتابيز نفسها بترفض.
  // **والفلتر سايبينه** — حزام وحمّالة.
  //
  // ⚠️ **والجدولين المتداخلين هنا مثبتين**: `orders` وجوّاها `order_items`
  // بتتقرا بنفس الشكل في شاشة الأوردرات الشغّالة، و`customers` في شاشة
  // العملاء. الجدول اللي سياسته ناقصة **بيرجع فاضي من غير خطأ** — يعني
  // الشاشة تبان شغّالة وأرقامها أصفار، فمابنحوّلش غير المثبت.
  const db = await createClient();

  const [{ data: orders }, { data: people }] = await Promise.all([
    db
      .from("orders")
      .select(
        `customer_id, order_status, order_date, payment_method, amount_paid,
         discount, shipping_price, order_items(quantity, sale_price_at_order)`
      )
      .eq("tenant_id", me.tenantId)
      .limit(5000),
    db
      .from("customers")
      .select("id, full_name, phone")
      .eq("tenant_id", me.tenantId)
      .limit(5000),
  ]);

  const nameOf = new Map(
    (people ?? []).map((p) => [
      p.id as string,
      { name: (p.full_name as string) ?? "بدون اسم", phone: p.phone as string | null },
    ])
  );

  const stats = statsByCustomer((orders ?? []) as unknown as SegOrder[], cairoToday());
  const aov = overallAov(stats);
  const segments = segmentCustomers(stats, aov);

  return (
    <div className="space-y-4">
      <BackLink href="/customers" label="العملاء" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">شرايح العملاء</h1>
        <span className="text-sm text-gray-500">
          {stats.length} عميل · متوسط الأوردر {formatMoney(aov)}
        </span>
      </div>

      {segments.map((s) => (
        <div key={s.key} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">{s.label}</h2>
            <span className="text-sm tabular-nums text-gray-500">
              {s.customers.length} عميل · {formatMoney(s.spend)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{s.play}</p>

          {s.customers.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">مفيش حد في الشريحة دي.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {/* أول عشرة بالأكتر إنفاق — القايمة كاملة مالهاش لازمة
                      على الشاشة، اللي بيفرق مين الأول */}
                  {s.customers.slice(0, 10).map((c) => {
                    const p = nameOf.get(c.customerId);
                    return (
                      <tr key={c.customerId} className="border-t border-gray-100">
                        <td className="p-2">
                          <Link
                            href={`/customers/${c.customerId}`}
                            className="text-gray-900 hover:underline"
                          >
                            {p?.name ?? "بدون اسم"}
                          </Link>
                        </td>
                        <td className="p-2 text-gray-500">{c.orders} أوردر</td>
                        <td className="p-2 tabular-nums text-gray-900">
                          {formatMoney(c.spend)}
                        </td>
                        <td className="p-2 text-xs text-gray-400">
                          {c.daysSinceLast === null
                            ? "—"
                            : c.daysSinceLast === 0
                              ? "النهاردة"
                              : `من ${c.daysSinceLast} يوم`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {s.customers.length > 10 && (
                <p className="mt-2 text-xs text-gray-400">
                  و{s.customers.length - 10} غيرهم
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

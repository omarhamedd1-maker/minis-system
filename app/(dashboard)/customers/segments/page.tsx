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
import { allRows } from "@/lib/fetch-all-pages";

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
    allRows(db
      .from("orders")
      .select(
        `customer_id, order_status, order_date, payment_method, amount_paid,
         discount, shipping_price, order_items(quantity, sale_price_at_order)`
      )
      .eq("tenant_id", me.tenantId)),
    allRows(db
      .from("customers")
      .select("id, full_name, phone")
      .eq("tenant_id", me.tenantId)),
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
        <h1 className="text-2xl font-bold text-ink">شرايح العملاء</h1>
        <span className="text-sm text-ink-muted">
          {stats.length} عميل · متوسط الأوردر {formatMoney(aov)}
        </span>
      </div>

      {segments.map((s) => (
        <div key={s.key} className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">{s.label}</h2>
            <span className="text-sm tabular-nums text-ink-muted">
              {s.customers.length} عميل · {formatMoney(s.spend)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">{s.play}</p>

          {s.customers.length === 0 ? (
            <p className="mt-3 text-sm text-ink-faint">مفيش حد في الشريحة دي.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {/* أول عشرة بالأكتر إنفاق — القايمة كاملة مالهاش لازمة
                      على الشاشة، اللي بيفرق مين الأول */}
                  {s.customers.slice(0, 10).map((c) => {
                    const p = nameOf.get(c.customerId);
                    return (
                      <tr key={c.customerId} className="border-t border-line">
                        <td className="p-2">
                          <Link
                            href={`/customers/${c.customerId}`}
                            className="text-ink hover:underline"
                          >
                            {p?.name ?? "بدون اسم"}
                          </Link>
                        </td>
                        <td className="p-2 text-ink-muted">{c.orders} أوردر</td>
                        <td className="p-2 tabular-nums text-ink">
                          {formatMoney(c.spend)}
                        </td>
                        <td className="p-2 text-xs text-ink-faint">
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
                <p className="mt-2 text-xs text-ink-faint">
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

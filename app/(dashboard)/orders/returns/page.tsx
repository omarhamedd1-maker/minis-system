import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions";
import { formatMoney } from "@/lib/format";
import { returnsBoard, returnRate } from "@/lib/returns-board";
import { returnReasonLabel } from "@/lib/return-reasons";

export const dynamic = "force-dynamic";

/**
 * ⚠️ **الفترة ٩٠ يوم** — أقدم من كده مافيش حاجة تتعمل فيه، وبيكبّر الجدول
 * لحد ما اللي مهم يضيع فيه.
 */
const WINDOW_DAYS = 90;

type Row = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  delivered_at: string | null;
  return_reason: string | null;
  discount: number | null;
  bosta_shipping_cost: number | null;
  bosta_fees_real: number | null;
  customers: { full_name: string | null; phone: string | null } | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

/**
 * كل حاجة راجعة في مكان واحد.
 *
 * ⚠️⚠️ **أهم رقم هنا هو «رجع ومارجعش المخزن»** — البضاعة في إيدك في الواقع
 * والسيستم فاكرها متباعة، فبتشتري تاني حاجة عندك.
 */
export default async function ReturnsPage() {
  await requirePagePermission("orders.view");
  const supabase = await createClient();

  const since = new Date(new Date().getTime() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [{ data, error }, { count: settled }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, order_number, order_status, order_date, delivered_at, return_reason,
         discount, bosta_shipping_cost, bosta_fees_real,
         customers(full_name, phone),
         order_items(quantity, sale_price_at_order)`
      )
      .in("order_status", ["returned", "returned_after_delivery"])
      .gte("order_date", since)
      .limit(1000)
      .overrideTypes<Row[]>(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("order_status", ["delivered", "returned", "returned_after_delivery"])
      .gte("order_date", since),
  ]);

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        معرفناش نقرا المرتجعات: {error.message}
      </div>
    );
  }

  /**
   * ⚠️⚠️ **الرجوع للمخزن بيتعرف من حركات المخزون نفسها** مش من عمود.
   * الحركة بتتسجّل بسبب اسمه، فوجودها هو الدليل — وده نفس اللي زرار
   * الرجوع في صفحة الأوردر بيعتمد عليه، فالشاشتين مايختلفوش.
   */
  const ids = (data ?? []).map((o) => o.id);
  const { data: moves } = ids.length
    ? await supabase
        .from("stock_movements")
        .select("related_order_id, reason")
        .in("related_order_id", ids)
        .limit(3000)
    : { data: [] };

  const byOrder = new Map<string, string[]>();
  for (const m of (moves ?? []) as { related_order_id: string; reason: string | null }[]) {
    const list = byOrder.get(m.related_order_id) ?? [];
    list.push(String(m.reason ?? "").trim());
    byOrder.set(m.related_order_id, list);
  }

  const board = returnsBoard(
    (data ?? []).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      orderStatus: o.order_status,
      movedAt: o.delivered_at ?? o.order_date,
      reason: o.return_reason,
      customerName: o.customers?.full_name ?? null,
      customerPhone: o.customers?.phone ?? null,
      itemsTotal:
        (o.order_items ?? []).reduce(
          (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
          0
        ) - Number(o.discount ?? 0),
      // ⚠️ الحقيقي لو موجود، والتقديري لو لسه — مش صفر
      shippingCost: Number(o.bosta_fees_real ?? o.bosta_shipping_cost ?? 0),
      restocked: (byOrder.get(o.id) ?? []).includes("رجوع مرتجع للمخزن"),
      hadStockMovement: (byOrder.get(o.id) ?? []).length > 0,
    }))
  );

  const rate = returnRate(settled ?? 0, board.count);

  return (
    <div className="space-y-4">
      <BackLink href="/orders" label="الأوردرات" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">المرتجعات</h1>
        <span className="text-xs text-gray-500">آخر {WINDOW_DAYS} يوم</span>
      </div>

      {board.count === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مافيش مرتجعات في الفترة دي.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Box
              label="راجع"
              value={String(board.count)}
              note={rate === null ? null : `${rate}% من اللي خلص`}
            />
            <Box
              label="استلم وبعدين رجّع"
              value={String(board.afterDelivery)}
              note={board.afterDelivery > 0 ? "شحنتين وفلوس اترجعت" : null}
            />
            <Box
              label="شحن اتحرق"
              value={formatMoney(Math.round(board.shippingBurned))}
              note="راح وجه من غير بيعة"
            />
            <Box
              label="مارجعش المخزن"
              value={String(board.notRestocked.length)}
              note={
                board.stuckValue > 0
                  ? formatMoney(Math.round(board.stuckValue))
                  : null
              }
              danger={board.notRestocked.length > 0}
            />
          </div>

          {/*
            ⚠️⚠️ **ده الرقم اللي بيبوّظ المخزون بالهدوء.** البضاعة رجعتلك في
            الواقع، والسيستم لسه شايفها متباعة — فبتشتري تاني حاجة موجودة
            عندك على الرف.
          */}
          {board.notRestocked.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-sm font-bold text-gray-900">
                رجعلك ولسه مادخلش المخزن
              </h2>
              <p className="mt-0.5 text-[11px] text-gray-400">
                البضاعة دي في إيدك، والمخزون مش حاسبها. الرجوع بيتعمل من صفحة
                الأوردر.
              </p>
              <div className="mt-3 space-y-1.5">
                {board.notRestocked.slice(0, 15).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <Link
                      href={`/orders/${r.id}`}
                      className="text-gray-900 hover:underline"
                    >
                      #{r.orderNumber} · {r.customerName ?? "بدون اسم"}
                    </Link>
                    <span className="tabular-nums text-xs text-gray-500">
                      {formatMoney(Math.round(r.itemsTotal))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/*
            ⚠️ **الحالة التالتة**: راجع بس مالوش حركة مخزون خالص، يعني
            مينفعش يرجع المخزن أصلًا لأن مافيش حاجة اتخصمت. لو حطّيناهم مع
            اللي فوق الرقم بيتضاعف تقريبًا وبيبقى إنذار نصّه وهم.
          */}
          {board.outsideStock.length > 0 && (
            <p className="text-[11px] leading-relaxed text-gray-400">
              وفيه {board.outsideStock.length} أوردر راجع مالهمش حركة مخزون خالص
              — دول اتسجّلوا من غير ما يخصموا من المخزون، فمفيش حاجة ترجع.
            </p>
          )}

          <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-bold text-gray-900">رجعوا ليه؟</h2>
            <div className="mt-3 space-y-1.5">
              {board.byReason.map((r) => (
                <div
                  key={r.reason}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-gray-900">
                    {r.reason === "unknown"
                      ? "السبب مش مكتوب"
                      : returnReasonLabel(r.reason)}
                  </span>
                  <span className="tabular-nums text-xs text-gray-500">
                    {r.count} · {formatMoney(Math.round(r.value))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-bold text-gray-900">كل الراجع</h2>
            <div className="mt-3 space-y-2">
              {board.rows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/orders/${r.id}`}
                      className="text-sm text-gray-900 hover:underline"
                    >
                      #{r.orderNumber} · {r.customerName ?? "بدون اسم"}
                    </Link>
                    <p className="text-[11px] text-gray-400">
                      {r.reason ? returnReasonLabel(r.reason) : "السبب مش مكتوب"}
                      {r.afterDelivery && " · استلم وبعدين رجّع"}
                      {!r.restocked && " · لسه مادخلش المخزن"}
                    </p>
                  </div>
                  <span className="tabular-nums text-xs text-gray-500">
                    خسّرت {formatMoney(Math.round(r.lost))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Box({
  label,
  value,
  note,
  danger,
}: {
  label: string;
  value: string;
  note?: string | null;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${
          danger ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {note && <p className="text-[11px] text-gray-400">{note}</p>}
    </div>
  );
}

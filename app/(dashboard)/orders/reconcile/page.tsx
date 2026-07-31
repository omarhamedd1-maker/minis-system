import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AT_CARRIER_STATUSES,
  EXCLUDED_STATUSES,
  formatDate,
  formatMoney,
  orderStatusBadge,
} from "@/lib/format";
import { BackLink } from "@/components/BackLink";
import { LinkMissingShipments } from "@/components/LinkMissingShipments";
import { requirePagePermission } from "@/lib/permissions";
import { linkMissingShipments } from "./actions";

type Row = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  archived: boolean;
  discount: number;
  shipping_price: number;
  bosta_state: string | null;
  bosta_tracking: string | null;
  bosta_cod: number | null;
  bosta_collected: boolean | null;
  delivered_at: string | null;
  customers: { full_name: string | null; phone: string | null } | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
  }[];
};

// نفس منطق mapState اللي في دالة المزامنة — عشان نكشف لو الحالة عندنا مش مطابقة لبوسطة
function mapBostaState(s: string | null): string | null {
  const x = (s ?? "").toLowerCase();
  if (!x) return null;
  if (x.includes("cancel")) return "cancelled";
  if (
    x.includes("returned to origin") ||
    x.includes("returned to business") ||
    x === "returned" ||
    x.includes("exchanged & returned")
  )
    return "returned";
  if (x.includes("return")) return "returning";
  if (
    x.includes("awaiting action") ||
    x.includes("action required") ||
    x.includes("exception") ||
    x.includes("on hold")
  )
    return "awaiting_action";
  if (x.includes("deliver") && !x.includes("out for delivery")) return "delivered";
  if (x.includes("out for delivery") || x.includes("with courier"))
    return "out_for_delivery";
  if (
    x.includes("picked") ||
    x.includes("transit") ||
    x.includes("received") ||
    x.includes("processing") ||
    x.includes("at warehouse") ||
    x.includes("hub")
  )
    return "shipped";
  if (
    x.includes("created") ||
    x.includes("requested") ||
    x.includes("waiting for pickup") ||
    x.includes("pickup") ||
    x.includes("route")
  )
    return "ready";
  return null;
}

type Issue = {
  order: Row;
  kind: string;
  detail: string;
  severity: "high" | "mid" | "low";
};

export default async function ReconcilePage() {
  await requirePagePermission("finance.dashboard");
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("orders")
    .select(
      `id, order_number, order_status, order_date, archived, discount, shipping_price,
       bosta_state, bosta_tracking, bosta_cod, bosta_collected, delivered_at,
       customers(full_name, phone),
       order_items(quantity, sale_price_at_order, cost_price_at_order)`
    )
    .order("order_date", { ascending: false })
    .limit(5000)
    .overrideTypes<Row[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ: {error.message}
      </div>
    );
  }

  const orders = data ?? [];
  const itemsTotal = (o: Row) =>
    o.order_items.reduce((s, i) => s + i.quantity * i.sale_price_at_order, 0);
  const orderTotal = (o: Row) =>
    itemsTotal(o) - o.discount + (o.order_status === "cancelled" ? 0 : o.shipping_price);

  const issues: Issue[] = [];

  for (const o of orders) {
    const sysStatus = o.order_status ?? "new";
    const bostaMapped = mapBostaState(o.bosta_state);

    // 1) الحالة عندنا مش مطابقة لبوسطة
    //
    // **بوسطة بتكتب "Delivered" على اللي اتسلّم واللي رجع لنا كمان.**
    // التفرقة في `state.code` (٤٦ = راجعة) مش في النص، وإحنا مخزنين النص بس.
    // المزامنة بتقرا الكود وهي المرجع — فلو حالتنا راجعة والنص بيقول
    // Delivered، دي مش مخالفة دي غموض معروف. من غير الاستثناء ده الصفحة
    // كانت بتطلّع ٣٩ إنذار كاذب، والصفحة اللي بتكدب أسوأ من مفيش صفحة.
    const ambiguousDelivered =
      bostaMapped === "delivered" &&
      ["returned", "returning", "returned_after_delivery"].includes(sysStatus);

    if (
      bostaMapped &&
      bostaMapped !== sysStatus &&
      !ambiguousDelivered &&
      sysStatus !== "returned_after_delivery" // دي بنحددها إحنا بإيدنا
    ) {
      issues.push({
        order: o,
        kind: "الحالة مش مطابقة لبوسطة",
        detail: `عندنا "${orderStatusBadge(sysStatus).label}" وبوسطة "${o.bosta_state}" (يعني ${orderStatusBadge(bostaMapped).label})`,
        severity: "high",
      });
    }

    // 2) اتسلّم بس مفيش تاريخ تسليم — التحصيل مش هيتحسب صح
    if (sysStatus === "delivered" && !o.delivered_at) {
      issues.push({
        order: o,
        kind: "متسلّم بلا تاريخ تسليم",
        detail: "التحصيل مش هيدخل في الداشبورد لأن تاريخ التسليم فاضي",
        severity: "high",
      });
    }

    // 3) مبلغ التحصيل في بوسطة مش مطابق لإجمالي الأوردر
    const total = orderTotal(o);
    const cod = Number(o.bosta_cod ?? 0);
    if (
      o.bosta_tracking &&
      cod > 0 &&
      Math.abs(cod - total) > 1 &&
      !EXCLUDED_STATUSES.includes(sysStatus)
    ) {
      issues.push({
        order: o,
        kind: "التحصيل مش مطابق للإجمالي",
        detail: `بوسطة بتحصّل ${formatMoney(cod)} والإجمالي عندنا ${formatMoney(total)} (فرق ${formatMoney(Math.abs(cod - total))})`,
        severity: "high",
      });
    }

    // 4) أوردر مع شركة الشحن بس مفيش رقم تتبع
    if (AT_CARRIER_STATUSES.includes(sysStatus) && !o.bosta_tracking) {
      issues.push({
        order: o,
        kind: "مع الشحن بلا رقم تتبع",
        detail: "الحالة بتقول مع الشحن بس مفيش شحنة بوسطة مربوطة",
        severity: "mid",
      });
    }

    // 5) بنود بتكلفة صفر — الربح بيطلع أكبر من الحقيقة
    const zeroCost = o.order_items.some(
      (i) => Number(i.cost_price_at_order ?? 0) === 0
    );
    if (zeroCost && !EXCLUDED_STATUSES.includes(sysStatus)) {
      issues.push({
        order: o,
        kind: "تكلفة بند = صفر",
        detail: "الربح بيتحسب أكبر من الحقيقة — املأ تكلفة المنتج",
        severity: "mid",
      });
    }

    // 6) أوردر بلا بنود
    if (o.order_items.length === 0) {
      issues.push({
        order: o,
        kind: "أوردر بلا منتجات",
        detail: "مفيش بنود — يا إما ناقص يا إما ملغي",
        severity: "mid",
      });
    }

    // 7) العميل ملوش تليفون — مش هينفع نبعته لبوسطة
    const digits = (o.customers?.phone ?? "").replace(/\D/g, "");
    if (digits.length < 10 && !EXCLUDED_STATUSES.includes(sysStatus)) {
      issues.push({
        order: o,
        kind: "تليفون العميل ناقص",
        detail: "مش هينفع نعمل شحنة بوسطة من غير رقم صح",
        severity: "low",
      });
    }

    // 8) بوسطة بتقول متسلّم ومحصّل بس إحنا معلّمينه مرتجع
    if (
      o.bosta_collected &&
      (sysStatus === "returned" || sysStatus === "cancelled")
    ) {
      issues.push({
        order: o,
        kind: "بوسطة حصّلت والأوردر معلّم مرتجع/ملغي",
        detail: `بوسطة حصّلت ${formatMoney(cod)} — راجع الحالة`,
        severity: "high",
      });
    }

    // 9) إحنا ملغينه بس بوسطة لسه شغالة عليه (المزامنة مش بتلمس الملغي)
    if (
      sysStatus === "cancelled" &&
      bostaMapped &&
      bostaMapped !== "cancelled" &&
      !o.bosta_collected
    ) {
      issues.push({
        order: o,
        kind: "ملغي عندنا وبوسطة لسه شغالة عليه",
        detail: `بوسطة بتقول "${o.bosta_state}" — يا إما تلغي الشحنة في بوسطة يا إما ترجّع حالة الأوردر`,
        severity: "high",
      });
    }
  }

  const bySeverity = { high: 0, mid: 0, low: 0 };
  for (const i of issues) bySeverity[i.severity]++;

  // نجمّع بنوع المشكلة
  const groups = new Map<string, Issue[]>();
  for (const i of issues) {
    const list = groups.get(i.kind) ?? [];
    list.push(i);
    groups.set(i.kind, list);
  }
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );

  const sevLabel = { high: "مهم", mid: "متوسط", low: "بسيط" };
  const sevClass = {
    high: "bg-red-50 text-red-700",
    mid: "bg-amber-50 text-amber-700",
    low: "bg-gray-100 text-gray-600",
  };

  // ===== الخلاصة =====
  // الصفحة كانت بتبدأ بأربع مربعات أرقام، واللي بيقراها لازم يستنتج بنفسه
  // هو تمام ولا لأ. الخلاصة بتقول له على طول.
  const ordersWithIssues = new Set(issues.map((i) => i.order.id)).size;
  const verdict =
    bySeverity.high > 0
      ? {
          title: `${bySeverity.high} مشكلة محتاجة تتظبط`,
          note: "دي بتأثر على فلوسك أو على حالة أوردراتك — بصّ عليها قبل ما تعتمد الأرقام.",
          box: "bg-red-50",
          text: "text-red-900",
          sub: "text-red-800",
        }
      : bySeverity.mid + bySeverity.low > 0
        ? {
            title: "مفيش حاجة خطيرة",
            note: "فاضل حاجات بسيطة تحت — تظبطها وقت ما تحب.",
            box: "bg-amber-50",
            text: "text-amber-900",
            sub: "text-amber-800",
          }
        : {
            title: "كل حاجة مظبوطة",
            note: "أوردراتك متطابقة مع بوسطة، والأرقام اللي في الداشبورد تقدر تعتمد عليها.",
            box: "bg-green-50",
            text: "text-green-900",
            sub: "text-green-800",
          };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">مراجعة الداتا</h1>
        <BackLink href="/orders" label="الرجوع للأوردرات" />
      </div>

      <div className={`rounded-xl p-5 ${verdict.box}`}>
        <h2 className={`text-lg font-bold ${verdict.text}`}>{verdict.title}</h2>
        <p className={`mt-1 text-sm ${verdict.sub}`}>{verdict.note}</p>
        <p className={`mt-2 text-xs ${verdict.sub} opacity-75`}>
          فحصنا {orders.length} أوردر
          {ordersWithIssues > 0 && ` — ${ordersWithIssues} منهم فيهم حاجة`}.
        </p>
      </div>

      {/* الصفحة كانت بتكشف بس — دي أول أداة بتصلّح */}
      <LinkMissingShipments action={linkMissingShipments} />

      {issues.length === 0 ? (
        <div className="rounded-xl bg-green-50 p-8 text-center text-sm text-green-800">
          كل الأوردرات مطابقة — مفيش مشاكل 🎉
        </div>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([kind, list]) => (
            <details
              key={kind}
              className="rounded-xl bg-white shadow-sm"
              open={list[0].severity === "high"}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${sevClass[list[0].severity]}`}
                  >
                    {sevLabel[list[0].severity]}
                  </span>
                  <span className="truncate text-sm font-bold text-gray-900">
                    {kind}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-gray-500">
                  {list.length}
                </span>
              </summary>
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {list.slice(0, 100).map((i, idx) => (
                  <li key={idx} className="px-4 py-2.5">
                    <Link
                      href={`/orders/${i.order.id}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {i.order.order_number ?? "بدون رقم"}
                      </span>
                      <span className="text-xs text-gray-500">
                        {i.order.customers?.full_name ?? "—"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(i.order.order_date)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${orderStatusBadge(i.order.order_status).className}`}
                      >
                        {orderStatusBadge(i.order.order_status).label}
                      </span>
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-600">{i.detail}</p>
                  </li>
                ))}
                {list.length > 100 && (
                  <li className="px-4 py-2 text-xs text-gray-400">
                    و{list.length - 100} أوردر تاني...
                  </li>
                )}
              </ul>
            </details>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        شغّل مزامنة بوسطة الأول عشان الأرقام تبقى أحدث، وبعدين راجع الصفحة دي.
      </p>
    </div>
  );
}

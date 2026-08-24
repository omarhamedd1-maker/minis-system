"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import {
  computeHeadline,
  dailySalesSeries,
  resolvePeriod,
  statusCounts,
  type DayPoint,
  type Headline,
  type StatOrder,
  type StatExpense,
} from "@/lib/dashboard-stats";
import { CountUp } from "./CountUp";

/**
 * ⚠️ **`bosta_fees_real` لازم يفضل هنا.**
 *
 * `orderCarrierCost` بتاخد الرسوم الحقيقية لو موجودة، وبترجع للتقدير القديم
 * (`bosta_shipping_cost`) لو مش موجودة. والعمود ده كان ناقص من الاستعلام ده،
 * فالسيرفر كان بيرسم الأرقام بالرسوم الحقيقية، وأول ما الكروت تحدّث نفسها من
 * المتصفح كانت بتستبدلها بالتقدير من غير ما حد ياخد باله.
 *
 * وده كان مستخبي في مينيز لأن التقدير القديم متسجّل على أوردراتها؛ بان في
 * بيزنس التقدير فيه صفر — الكروت طلعت صفر رغم إن الرسوم الحقيقية موجودة.
 */
const ORDER_SELECT =
  "order_status, order_date, delivered_at, discount, shipping_price, bosta_shipping_cost, bosta_fees_real, bosta_cod, bosta_collected, order_items(quantity, sale_price_at_order, cost_price_at_order)";

export function LiveMoneyCards({
  initial,
  period,
  from,
  to,
}: {
  initial: Headline;
  period?: string;
  from?: string;
  to?: string;
}) {
  const [s, setS] = useState<Headline>(initial);
  // توزيع حالات الفترة + خط الميلان — بيملّوا من أول لفة للعميل
  const [dist, setDist] = useState<{ status: string; count: number }[]>([]);
  const [series, setSeries] = useState<DayPoint[]>([]);

  // لما السيرفر يبعت أرقام جديدة (تغيير الفترة مثلاً) نبدأ منها.
  // ده الأسلوب اللي رياكت بيوصّي بيه بدل ما نعمل effect بيغيّر الحالة.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setS(initial);
  }

  // أنيميشن البداية من صفر — بس أول فتحة للسيستم في الجلسة
  const [intro] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem("minisDashIntro")) return false;
      sessionStorage.setItem("minisDashIntro", "1");
      return true;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const supabase = createClient();
    const { periodStart, periodEnd, fetchStart } = resolvePeriod({
      period,
      from,
      to,
    });
    let active = true;

    async function load() {
      const [o, e] = await Promise.all([
        supabase
          .from("orders")
          .select(ORDER_SELECT)
          // نجيب اللي اتعمل في الفترة أو اللي اتسلّم فيها (عشان التحصيل بيتحسب بتاريخ التسليم)
          .or(`order_date.gte.${fetchStart},delivered_at.gte.${fetchStart}`)
          .limit(5000),
        supabase
          .from("expenses")
          .select("amount")
          .gte("expense_date", periodStart)
          .lte("expense_date", periodEnd)
          .limit(5000),
      ]);
      if (!active || o.error || e.error || !o.data || !e.data) return;
      const rows = o.data as unknown as StatOrder[];
      setS(computeHeadline(rows, e.data as unknown as StatExpense[], periodStart, periodEnd));
      // الشريط وخط الميلان من نفس الداتا — مفيش نداء زيادة
      setDist(statusCounts(rows, periodStart, periodEnd));
      setSeries(dailySalesSeries(rows, 14, periodEnd));
    }

    load();
    const id = setInterval(load, 20000); // تحديث كل 20 ثانية
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [period, from, to]);

  const money = (n: number) => formatMoney(n);
  const plain = (n: number) => new Intl.NumberFormat("en").format(n);
  // نقطة بداية الأنيميشن: صفر أول فتحة، وبعد كده من القيمة الحالية عادي
  const base = intro ? 0 : undefined;
  const key = intro ? "i" : "d";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ===== شريط حالات الفترة =====
          صحة البيع بتتبان من التوزيع من غير قراية: أحمر كتير = مشكلة. */}
      {dist.length > 0 && (
        <div className="rounded-xl bg-white p-3 shadow-sm sm:p-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
            {dist.map(({ status, count }) => (
              <div
                key={status}
                style={{
                  width: `${(count / dist.reduce((t, d) => t + d.count, 0)) * 100}%`,
                  backgroundColor: STRIP_COLORS[status] ?? "#9ca3af",
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {dist.map(({ status, count }) => (
              <span
                key={status}
                className="inline-flex items-center gap-1 text-[11px] text-gray-600"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STRIP_COLORS[status] ?? "#9ca3af" }}
                />
                {STATUS_NAMES[status] ?? status}{" "}
                <b className="tabular-nums text-gray-900">{count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {/* على الشاشة الكبيرة: المبيعات وصافي الربح كروت كبيرة، والباقي بيتقسّم 4 في الصف */}
      <Card
        label="المبيعات"
        className="col-span-2"
        hero
        hint={`آخر ١٤ يوم · من غير الملغي والمرتجع: ${money(s.sales)}`}
      >
        <span className="text-gray-900">
          <CountUp key={key} baseline={base} value={s.grossSales} format={money} />
        </span>
        <Spark points={series} />
      </Card>
      <Card label="عدد الأوردرات">
        <span className="text-gray-900">
          <CountUp
            key={key}
            baseline={base}
            value={s.orderCount}
            format={plain}
          />
        </span>
      </Card>
      <Card label="المصاريف">
        <span className="text-red-600">
          <CountUp
            key={key}
            baseline={base}
            value={s.expensesTotal}
            format={money}
          />
        </span>
      </Card>
      <Card label="أرباح المنتجات">
        <span className="text-green-600">
          <CountUp key={key} baseline={base} value={s.profit} format={money} />
        </span>
      </Card>
      <Card label="صافي الربح" className="lg:col-span-2" hero>
        <span className={s.netProfit >= 0 ? "text-green-600" : "text-red-600"}>
          <CountUp
            key={key}
            baseline={base}
            value={s.netProfit}
            format={money}
          />
        </span>
      </Card>
      <Card label="تحصيل بوسطة (المسلّمة)">
        <span className="text-emerald-600">
          <CountUp key={key} baseline={base} value={s.cod} format={money} />
        </span>
      </Card>
      <Card label="متوسط قيمة الأوردر">
        <span className="text-gray-900">
          <CountUp key={key} baseline={base} value={s.avgOrder} format={money} />
        </span>
      </Card>
      <Card
        label="شحن محصّل من العملاء"
        hint={`اللي العميل دفعه في ${s.shippedCount} أوردر اتشحن`}
      >
        <span className="text-green-600">
          <CountUp
            key={key}
            baseline={base}
            value={s.shippingRevenue}
            format={money}
          />
        </span>
      </Card>
      <Card
        label="شحن دفعته من جيبك"
        hint="رسوم بوسطة ناقص اللي العميل دفعه — بيتخصم من صافي الربح، وبيتحسب بعد ما بوسطة تستلم"
        className="lg:col-span-2"
      >
        <span className="text-red-600">
          <CountUp
            key={key}
            baseline={base}
            value={s.netShipping}
            format={money}
          />
        </span>
      </Card>
      </div>
    </div>
  );
}

/** ألوان الشريط — نفس دلالة ألوان الحالات في `format.ts` بس أقوى عشان البص */
const STRIP_COLORS: Record<string, string> = {
  new: "#3b82f6",
  confirmed: "#0ea5e9",
  packed: "#a855f7",
  ready: "#06b6d4",
  shipped: "#6366f1",
  out_for_delivery: "#8b5cf6",
  delivered: "#10b981",
  awaiting_action: "#f59e0b",
  returning: "#fb923c",
  returned: "#f97316",
  returned_after_delivery: "#d97706",
  cancelled: "#ef4444",
};

/** أسماء الحالات للعرض — مختصرة عشان الشريحة الصغيرة */
const STATUS_NAMES: Record<string, string> = {
  new: "جديد",
  confirmed: "مؤكد",
  packed: "متغلف",
  ready: "جاهز",
  shipped: "مع بوسطة",
  out_for_delivery: "في الطريق",
  delivered: "اتبعت",
  awaiting_action: "محتاج تصرف",
  returning: "راجع",
  returned: "رجع",
  returned_after_delivery: "مرتجع بعد التسليم",
  cancelled: "ملغي",
};

/** خط الميلان — SVG صيفي من غير أي مكتبة */
function Spark({ points }: { points: DayPoint[] }) {
  // محتاجين يومين على الأقل، وفيه بيع فعلي — الخط على فاضي مالوش لازمة
  const max = Math.max(...points.map((p) => p.value), 0);
  if (points.length < 2 || max <= 0) return null;

  const w = 100;
  const h = 26;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = (i * step).toFixed(1);
      const y = (h - (p.value / max) * (h - 3) - 1.5).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-2 block h-6 w-full text-primary"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Card({
  label,
  hint,
  children,
  hero = false,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <p className="text-xs text-gray-500 sm:text-sm">{label}</p>
      <p
        className={`mt-1 text-xl font-bold sm:text-2xl ${
          hero ? "lg:text-4xl" : ""
        }`}
      >
        {children}
      </p>
      {hint && <p className="text-[11px] text-gray-400 sm:text-xs">{hint}</p>}
    </div>
  );
}

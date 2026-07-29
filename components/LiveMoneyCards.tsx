"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import {
  computeHeadline,
  resolvePeriod,
  type Headline,
  type StatOrder,
  type StatExpense,
} from "@/lib/dashboard-stats";
import { CountUp } from "./CountUp";

const ORDER_SELECT =
  "order_status, order_date, delivered_at, discount, shipping_price, bosta_shipping_cost, bosta_cod, bosta_collected, order_items(quantity, sale_price_at_order, cost_price_at_order)";

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
      setS(
        computeHeadline(
          o.data as unknown as StatOrder[],
          e.data as unknown as StatExpense[],
          periodStart,
          periodEnd
        )
      );
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
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {/* على الشاشة الكبيرة: المبيعات وصافي الربح كروت كبيرة، والباقي بيتقسّم 4 في الصف */}
      <Card label="المبيعات" className="col-span-2" hero>
        <span className="text-gray-900">
          <CountUp key={key} baseline={base} value={s.sales} format={money} />
        </span>
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

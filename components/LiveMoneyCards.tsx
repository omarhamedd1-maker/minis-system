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
  "order_status, order_date, delivered_at, discount, bosta_shipping_cost, bosta_cod, bosta_collected, order_items(quantity, sale_price_at_order, cost_price_at_order)";

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
  // أنيميشن البداية من صفر — بس أول فتحة للسيستم في الجلسة
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    setS(initial);
  }, [initial]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !sessionStorage.getItem("minisDashIntro")
    ) {
      sessionStorage.setItem("minisDashIntro", "1");
      setIntro(true);
    }
  }, []);

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
          .gte("order_date", fetchStart)
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
    const id = setInterval(load, 10000); // تحديث كل 10 ثواني
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="المبيعات">
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
      <Card label="أرباح المنتجات">
        <span className="text-green-600">
          <CountUp key={key} baseline={base} value={s.profit} format={money} />
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
      <Card label="صافي الربح">
        <span className={s.netProfit >= 0 ? "text-green-600" : "text-red-600"}>
          <CountUp
            key={key}
            baseline={base}
            value={s.netProfit}
            format={money}
          />
        </span>
      </Card>
      <Card label="تحصيل بوسطة الفعلي (COD)">
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
        hint={`90 لكل أوردر × ${s.shippedCount} أوردر اتشحن`}
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
        label="تكلفة شحن بوسطة"
        hint="رسوم بوسطة الحقيقية (تحصيل + تحويل + تأمين + فتح + ضريبة)"
      >
        <span className="text-red-600">
          <CountUp
            key={key}
            baseline={base}
            value={s.bostaShippingTotal}
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
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{children}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

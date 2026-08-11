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
import { Stat, StatGrid } from "./ui/Stat";

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

  const up = (v: number, fmt: (n: number) => string) => (
    <CountUp key={key} baseline={base} value={v} format={fmt} />
  );

  return (
    <StatGrid>
      {/* الصف الأول: التلاتة اللي بتبص عليهم الأول */}
      <Stat label="المبيعات" span={4} size="hero">{up(s.sales, money)}</Stat>
      <Stat label="صافي الربح" span={4} size="hero" tone={s.netProfit >= 0 ? "in" : "out"}>
        {up(s.netProfit, money)}
      </Stat>
      <Stat label="عدد الأوردرات" span={4} size="hero">{up(s.orderCount, plain)}</Stat>

      {/* الصف التاني: تفصيل الفلوس */}
      <Stat label="أرباح المنتجات" tone="in">{up(s.profit, money)}</Stat>
      <Stat label="المصاريف" tone="out">{up(s.expensesTotal, money)}</Stat>
      <Stat label="تحصيل بوسطة (المسلّمة)" tone="in">{up(s.cod, money)}</Stat>
      <Stat label="متوسط قيمة الأوردر">{up(s.avgOrder, money)}</Stat>

      {/* الصف التالت: الشحن — اللي دخل واللي خرج */}
      <Stat
        label="شحن محصّل من العملاء"
        hint={`اللي العميل دفعه في ${s.shippedCount} أوردر اتشحن`}
        span={6}
        tone="in"
      >
        {up(s.shippingRevenue, money)}
      </Stat>
      <Stat
        label="شحن دفعته من جيبك"
        hint="رسوم بوسطة ناقص اللي العميل دفعه — بيتخصم من صافي الربح"
        span={6}
        tone="out"
      >
        {up(s.netShipping, money)}
      </Stat>
    </StatGrid>
  );
}

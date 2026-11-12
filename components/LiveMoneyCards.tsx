"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cairoToday, formatMoney } from "@/lib/format";
import {
  computeHeadline,
  type Headline,
  type StatOrder,
  type StatExpense,
} from "@/lib/dashboard-stats";
import { CountUp } from "./CountUp";
import {
  DEFAULT_PERIOD,
  resolvePeriod,
  shiftDays,
} from "@/lib/periods";
import { allRows } from "@/lib/fetch-all-pages";
import { NOT_IN_PROFIT } from "@/lib/profit-exclusions";
import { loadHeadline } from "@/lib/profit-headline";

/** الأسامي من القايمة نفسها — النص الثابت كان هيقدم أول ما نوع يتضاف */
const EXCLUDED_NAMES = NOT_IN_PROFIT.map((c) => c.category).join(" · ");

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
  "order_status, order_date, delivered_at, discount, shipping_price, bosta_shipping_cost, bosta_fees_real, bosta_cod, bosta_collected, refunded_amount, refunded_at, order_items(quantity, sale_price_at_order, cost_price_at_order, returned_quantity, returned_condition)";

export function LiveMoneyCards({
  initial,
  tenantId,
  period,
  from,
  to,
}: {
  initial: Headline;
  /** دالة الربح محتاجاه — نفس البيزنس اللي السيرفر حسب له */
  tenantId: string;
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
    // ⚠️ نفس الفترة اللي السيرفر حسبها — من `lib/periods` بنفس الافتراضي
    const today = cairoToday();
    const range = resolvePeriod(
      { period, from, to },
      { today, defaultKey: DEFAULT_PERIOD }
    );
    const periodStart = range.start ?? today;
    const periodEnd = range.end;
    const fetchStart = shiftDays(periodStart, -1); // يوم زيادة لفرق التوقيت
    let active = true;

    async function load() {
      // ⚠️ الأول من دالة الداتابيز — ١٢ رقم بدل كل الأوردرات كل ٢٠ ثانية.
      // `null` = الدالة مش موجودة، فبنرجع للحسبة القديمة تحت.
      try {
        const fromDb = await loadHeadline(supabase, tenantId, periodStart, periodEnd);
        if (fromDb) {
          if (active) setS(fromDb);
          return;
        }
      } catch {
        // خطأ في الشبكة — الأرقام اللي على الشاشة بتفضل لحد اللفة الجاية
        return;
      }
      const [o, e] = await Promise.all([
        allRows(supabase
          .from("orders")
          .select(ORDER_SELECT)
          // نجيب اللي اتعمل في الفترة أو اللي اتسلّم فيها (عشان التحصيل بيتحسب بتاريخ التسليم)
          .or(`order_date.gte.${fetchStart},delivered_at.gte.${fetchStart}`)),
        allRows(supabase
          .from("expenses")
          .select("amount, category")
          .gte("expense_date", periodStart)
          .lte("expense_date", periodEnd)),
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

    /*
      ⚠️ **دقيقة مش ٢٠ ثانية** (٩ نوفمبر ٢٠٢٦) — فيرسل وقّف المشروع لما
      الاستخدام عدّى الباقة المجانية. الداشبورد المفتوحة كانت بتنده
      الداتابيز ١٨٠ مرة في الساعة، وده بيتضاعف بعدد الشاشات المفتوحة.

      ⚠️ **وبتوقف وهي مخفية.** التاب المفتوح في الخلفية كان بيفضل بينده
      طول اليوم ومحدش بيبص عليه — وده كان أغبى استهلاك في السيستم.
    */
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);

    // وأول ما ترجع للتاب، حدّث على طول بدل ما تستنى الدقيقة
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);

    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [period, from, to, tenantId]);

  const money = (n: number) => formatMoney(n);
  const plain = (n: number) => new Intl.NumberFormat("en").format(n);
  // نقطة بداية الأنيميشن: صفر أول فتحة، وبعد كده من القيمة الحالية عادي
  const base = intro ? 0 : undefined;
  const key = intro ? "i" : "d";

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {/*
        ⚠️ **تلات صفوف كاملة، مفيش خانة فاضية** (١٢ نوفمبر ٢٠٢٦).

        الشبكة ٤ على الكمبيوتر و٢ على الموبايل، والكروت لازم مجموع
        خاناتها يقفل الصف. كرت «قطع اتباعت» لما اتضاف خلّى المجموع ١٣،
        فآخر صف بقى فيه كرت لوحده وجنبه فراغ.

          ١) المبيعات (٢) · عدد الأوردرات · قطع اتباعت
          ٢) صافي الربح (٢) · أرباح المنتجات · المصاريف
          ٣) أوردرات اتسلمت · متوسط الأوردر · شحن محصّل · فرق الشحن

        اللي يضيف كرت جديد يعدّ الخانات: المجموع لازم يقبل القسمة على ٤.
      */}
      <Card
        label="المبيعات"
        className="col-span-2"
        hero
        hint={`من غير الملغي والمرتجع: ${money(s.sales)}`}
      >
        <span className="text-ink">
          <CountUp key={key} baseline={base} value={s.grossSales} format={money} />
        </span>
      </Card>
      <Card
        label="عدد الأوردرات"
        className={s.unitsSold === null ? "col-span-2" : ""}
      >
        <span className="text-ink">
          <CountUp
            key={key}
            baseline={base}
            value={s.orderCount}
            format={plain}
          />
        </span>
      </Card>
      {/*
        ⚠️ **الكرت بيختفي لو الرقم مش موجود** بدل ما يوري صفر — الصفر
        هنا بيتقرا «مفيش مبيعات» وده كذب. بيحصل لو دالة الداتابيز لسه
        القديمة (قبل `sql/profit-headline-units.sql`).
      */}
      {s.unitsSold !== null && (
        <Card
          label="قطع اتباعت"
          hint="مجموع القطع في أوردرات الفترة — من غير الملغي والمرتجع، والقطعة اللي رجعت بعد التسليم متخصومة"
        >
          <span className="text-ink">
            <CountUp
              key={key}
              baseline={base}
              value={s.unitsSold}
              format={plain}
            />
          </span>
        </Card>
      )}
      {/* الصف التاني: الربح — الصافي كبير، وجنبه الرقمين اللي بيتحسب منهم */}
      <Card label="صافي الربح" className="col-span-2" hero>
        <span className={s.netProfit >= 0 ? "text-success" : "text-danger"}>
          <CountUp
            key={key}
            baseline={base}
            value={s.netProfit}
            format={money}
          />
        </span>
      </Card>
      <Card label="أرباح المنتجات">
        <span className="text-success">
          <CountUp key={key} baseline={base} value={s.profit} format={money} />
        </span>
      </Card>
      <Card
        label="المصاريف"
        hint={
          s.expensesExcluded > 0
            ? `و${money(s.expensesExcluded)} مش في الربح (${EXCLUDED_NAMES})`
            : undefined
        }
      >
        <span className="text-danger">
          <CountUp
            key={key}
            baseline={base}
            value={s.expensesTotal}
            format={money}
          />
        </span>
      </Card>
      {/* الصف التالت: التحصيل والشحن — أربع كروت قد بعض */}
      <Card label="أوردرات اتسلمت">
        <span className="text-success">
          <CountUp key={key} baseline={base} value={s.cod} format={money} />
        </span>
      </Card>
      <Card label="متوسط قيمة الأوردر">
        <span className="text-ink">
          <CountUp key={key} baseline={base} value={s.avgOrder} format={money} />
        </span>
      </Card>
      <Card
        label="شحن محصّل من العملاء"
        hint={`اللي العميل دفعه في ${s.shippedCount} أوردر اتشحن`}
      >
        <span className="text-success">
          <CountUp
            key={key}
            baseline={base}
            value={s.shippingRevenue}
            format={money}
          />
        </span>
      </Card>
      {/*
        ⚠️ **الكرت ده بيقلب اسمه، مابيوريش رقم بالسالب.**

        الرقم هو رسوم بوسطة ناقص اللي العميل دفعه. السالب معناه العميل
        دفع شحن أكتر من تكلفة بوسطة — يعني **كسب** مش خسارة. وكان بيتعرض
        «شحن دفعته من جيبك: ؜−٢٬٠٨٧» وده بيتقرا غلط: إشارة ناقص جنب كلمة
        «دفعته» معناها إيه بالظبط؟
        دلوقتي الاسم بيقول الاتجاه، والرقم موجب دايمًا (قرار عمر ٨ نوفمبر).
      */}
      <Card
        label={s.netShipping >= 0 ? "شحن دفعته من جيبك" : "شحن كسبت فيه"}
        hint={
          s.netShipping >= 0
            ? "رسوم بوسطة أكتر من اللي العميل دفعه — الفرق بيتخصم من صافي الربح"
            : "العميل دفع شحن أكتر من رسوم بوسطة — الفرق بيتضاف لصافي الربح"
        }
      >
        <span className={s.netShipping >= 0 ? "text-danger" : "text-success"}>
          <CountUp
            key={key}
            baseline={base}
            value={Math.abs(s.netShipping)}
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
      className={`rounded-card bg-surface p-4 shadow-card sm:p-5 ${className}`}
    >
      <p className="text-xs text-ink-muted sm:text-sm">{label}</p>
      <p
        className={`mt-1 text-xl font-bold sm:text-2xl ${
          hero ? "lg:text-4xl" : ""
        }`}
      >
        {children}
      </p>
      {hint && <p className="text-[11px] text-ink-faint sm:text-xs">{hint}</p>}
    </div>
  );
}

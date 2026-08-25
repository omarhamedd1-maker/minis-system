import { BackLink } from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions";
import { formatMoney, cairoToday } from "@/lib/format";
import { areaOf } from "@/lib/order-map";
import {
  buildReport,
  weakRows,
  MEASURES,
  GROUPS,
  MIN_FOR_RATE,
  type Measure,
  type Group,
} from "@/lib/report-builder";

export const dynamic = "force-dynamic";

type Row = {
  order_status: string | null;
  order_date: string | null;
  discount: number | null;
  shipping_price: number | null;
  customers: { full_name: string | null; address: string | null } | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
    product_variants: {
      variant_name: string | null;
      products: { name: string | null; name_ar: string | null } | null;
    } | null;
  }[];
};

/**
 * تقارير تعملها بنفسك.
 *
 * ⚠️⚠️ **من قطع معروفة مش من كلام حر** — تختار تقيس إيه، ومقسّم على إيه،
 * وفي أي فترة. لو كانت لغة استعلام، أي غلطة فيها بتبقى رقم غلط بيتاخد
 * عليه قرار.
 *
 * ⚠️ **والاختيار في اللينك** — يعني التقرير اللي وصلت له ينفع تحفظه في
 * المفضلة أو تبعته لحد، من غير ما نعمل جدول تقارير محفوظة.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    measure?: string;
    group?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const q = await searchParams;
  await requirePagePermission("finance.dashboard");

  const measure: Measure = (q.measure ?? "") in MEASURES
    ? (q.measure as Measure)
    : "sales";
  const group: Group = (q.group ?? "") in GROUPS ? (q.group as Group) : "month";

  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = isDate(q.from) ? q.from! : null;
  const to = isDate(q.to) ? q.to! : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `order_status, order_date, discount, shipping_price,
       customers(full_name, address),
       order_items(quantity, sale_price_at_order, cost_price_at_order,
         product_variants(variant_name, products(name, name_ar)))`
    )
    .eq("archived", false)
    .order("order_date", { ascending: false })
    .limit(3000)
    .overrideTypes<Row[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        معرفناش نقرا الأوردرات: {error.message}
      </div>
    );
  }

  const orders = (data ?? []).map((o) => {
    const items = o.order_items ?? [];
    return {
      orderStatus: o.order_status,
      orderDate: o.order_date,
      total:
        items.reduce(
          (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
          0
        ) -
        Number(o.discount ?? 0) +
        Number(o.shipping_price ?? 0),
      // ⚠️ **التكلفة وقت الأوردر** — تغيير التكلفة النهاردة مايغيّرش أرباح
      // الشهر اللي فات
      profit: items.reduce(
        (s, i) =>
          s +
          Number(i.quantity) *
            (Number(i.sale_price_at_order) - Number(i.cost_price_at_order)),
        0
      ),
      area: areaOf(o.customers?.address),
      customerName: o.customers?.full_name ?? null,
      products: items
        .map(
          (i) =>
            i.product_variants?.products?.name_ar ??
            i.product_variants?.products?.name ??
            null
        )
        .filter((x): x is string => Boolean(x)),
    };
  });

  const report = buildReport(orders, { measure, group, from, to });
  const weak = weakRows(report);
  const most = report.rows[0]?.value ?? 1;

  const href = (next: Partial<Record<string, string | null>>) => {
    const p = new URLSearchParams();
    const m = next.measure === null ? undefined : (next.measure ?? measure);
    const g = next.group === null ? undefined : (next.group ?? group);
    const f = next.from === null ? undefined : (next.from ?? from ?? undefined);
    const t = next.to === null ? undefined : (next.to ?? to ?? undefined);
    if (m && m !== "sales") p.set("measure", m);
    if (g && g !== "month") p.set("group", g);
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    const s = p.toString();
    return s ? `/reports?${s}` : "/reports";
  };

  const show = (v: number) =>
    report.unit === "money"
      ? formatMoney(v)
      : report.unit === "percent"
        ? `${v}%`
        : String(v);

  return (
    <div className="space-y-4">
      <BackLink href="/" label="الداشبورد" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">تقارير</h1>
        <span className="text-xs text-gray-500">
          {report.used} أوردر في الحسبة
        </span>
      </div>

      {/* ===== اختار ===== */}
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm sm:p-5">
        <Picker
          label="بتقيس إيه"
          options={MEASURES}
          current={measure}
          href={(k) => href({ measure: k })}
        />
        <Picker
          label="مقسّم على"
          options={GROUPS}
          current={group}
          href={(k) => href({ group: k })}
        />

        <form className="flex flex-wrap items-end gap-2 pt-1">
          {measure !== "sales" && (
            <input type="hidden" name="measure" value={measure} />
          )}
          {group !== "month" && (
            <input type="hidden" name="group" value={group} />
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="from" className="text-[11px] text-gray-500">
              من
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from ?? ""}
              max={cairoToday()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="to" className="text-[11px] text-gray-500">
              لـ
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to ?? ""}
              max={cairoToday()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark">
            طبّق
          </button>
          {(from || to) && (
            <a
              href={href({ from: null, to: null })}
              className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              كل الفترة
            </a>
          )}
        </form>
      </div>

      {/* ⚠️ الملاحظات اللي بتخلّي الرقم يتقرا صح */}
      {report.skipped && (
        <p className="text-[11px] leading-relaxed text-gray-400">
          {report.skipped}
        </p>
      )}
      {group === "product" && (
        <p className="text-[11px] leading-relaxed text-gray-400">
          الأوردر اللي فيه منتجين بيتعدّ في الصفين — فالمجموع هنا أكبر من
          إجماليك الحقيقي. ده صح للسؤال «المنتج ده باع كام».
        </p>
      )}
      {weak > 0 && (
        <p className="text-[11px] leading-relaxed text-amber-700">
          {weak} صف وراهم أقل من {MIN_FOR_RATE} أوردرات — النسبة عليهم بتتقلب
          بأوردر واحد.
        </p>
      )}

      {/* ===== النتيجة ===== */}
      {report.rows.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          مافيش داتا في الفترة دي.
        </p>
      ) : (
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
          {report.total !== null && (
            <div className="mb-3 flex items-baseline justify-between gap-2 border-b border-gray-50 pb-3">
              <span className="text-sm text-gray-500">
                {MEASURES[measure]} — الإجمالي
              </span>
              <span className="text-lg font-bold tabular-nums text-gray-900">
                {show(report.total)}
              </span>
            </div>
          )}

          <div className="space-y-3">
            {report.rows.map((r) => (
              <div key={r.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-gray-900">{r.label}</span>
                  <span className="text-xs tabular-nums text-gray-500">
                    {show(r.value)}
                    <span className="mr-2 text-gray-300">{r.count} أوردر</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{
                      width: `${Math.max(0, Math.min(100, Math.round((r.value / (most || 1)) * 100)))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-gray-400">
        الاختيار في اللينك — احفظه في المفضلة أو ابعته لحد، هيفتح على نفس
        التقرير.
      </p>
    </div>
  );
}

function Picker({
  label,
  options,
  current,
  href,
}: {
  label: string;
  options: Record<string, string>;
  current: string;
  href: (key: string) => string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-gray-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(options).map(([key, text]) => (
          <a
            key={key}
            href={href(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              current === key
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {text}
          </a>
        ))}
      </div>
    </div>
  );
}

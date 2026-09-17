// ==========================================================================
// تنزيل الداتا — نسخة عندك على جهازك
// --------------------------------------------------------------------------
// `/export`                 الأوردرات (الافتراضي)
// `/export?what=customers`  العملاء
// `/export?what=products`   المنتجات وأشكالها
// `/export?what=expenses`   المصاريف — بنفس فلاتر التاب (period · from · to · cat)
// `/export?what=cash`       حركات الخزنة من أولها بالرصيد بعد كل حركة (dir اختياري)
//
// ⚠️ **القراية بالاتصال المحمي** (`createClient`) مش بمفتاح الأدمن، فالملف
// بيطلع ببيانات البيزنس اللي داخل بس.
//
// ⚠️⚠️ **كل الصفوف صفحة صفحة** (`fetchAllPages`). كان مكتوب `.limit(20000)`
// وسوبابيز بيقطع عند ١٠٠٠ من غير خطأ — يعني أي بيزنس عدّى الألف كان بينزّل
// ملف ناقص وهو فاكره كامل.
// ==========================================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cairoToday, orderStatusBadge } from "@/lib/format";
import { can, getSessionUser } from "@/lib/permissions";
import { allRows, fetchAllPages } from "@/lib/fetch-all-pages";
import { csvResponse, csvText } from "@/lib/csv";
import { resolvePeriod } from "@/lib/periods";
import { cashRowLabel, type CashLabelRow } from "@/lib/cash-label";
import { withRunningBalance } from "@/lib/cash-ledger";

type ExportRow = {
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  delivered_at: string | null;
  shipping_price: number;
  archived: boolean;
  customers: { full_name: string | null; phone: string | null } | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

type CustomerRow = {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  created_at: string | null;
};

type VariantRow = {
  variant_name: string | null;
  sku: string | null;
  cost_price: number | null;
  sale_price: number | null;
  quantity_on_hand: number | null;
  products: { name: string | null; name_ar: string | null } | null;
};

type ExpenseRow = {
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  supplier_id: string | null;
};

type CashRow = CashLabelRow & {
  id: string;
  amount: number;
  transaction_date: string | null;
};

const day = (v: string | null | undefined) => (v ?? "").slice(0, 10);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const me = await getSessionUser();
  if (!can(me, "finance.export")) {
    return new Response("مالكش صلاحية تصدير البيانات", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const what = params.get("what") ?? "orders";
  const today = cairoToday();

  try {
    if (what === "customers") {
      const data = await fetchAllPages<CustomerRow>((from, to) =>
        supabase
          .from("customers")
          .select("full_name, phone, city, address, created_at")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to)
          .overrideTypes<CustomerRow[]>()
      );
      return csvResponse(
        csvText(
          ["الاسم", "التليفون", "المدينة", "العنوان", "أول أوردر"],
          data.map((c) => [c.full_name, c.phone, c.city, c.address, day(c.created_at)])
        ),
        "gridpoint-customers",
        today
      );
    }

    if (what === "products") {
      const data = await fetchAllPages<VariantRow>((from, to) =>
        supabase
          .from("product_variants")
          .select("variant_name, sku, cost_price, sale_price, quantity_on_hand, products(name, name_ar)")
          .order("id")
          .range(from, to)
          .overrideTypes<VariantRow[]>()
      );
      return csvResponse(
        csvText(
          ["المنتج", "الشكل", "الكود", "التكلفة", "سعر البيع", "المخزون"],
          data.map((v) => [
            v.products?.name_ar || v.products?.name,
            v.variant_name,
            v.sku,
            v.cost_price ?? 0,
            v.sale_price ?? 0,
            v.quantity_on_hand ?? 0,
          ])
        ),
        "gridpoint-products",
        today
      );
    }

    if (what === "expenses") {
      // ⚠️ **الصلاحية التانية** — التصدير مايفتحش بيانات الصفحة نفسها مقفولة عنه
      if (!can(me, "expenses.view")) {
        return new Response("مالكش صلاحية تشوف المصاريف", { status: 403 });
      }
      // نفس فلاتر التاب — اللي شايفه هو اللي بينزل
      const range = resolvePeriod(
        {
          period: params.get("period") ?? undefined,
          from: params.get("from") ?? undefined,
          to: params.get("to") ?? undefined,
        },
        { today, defaultKey: "30d", allowAll: true }
      );
      const cat = (params.get("cat") ?? "").trim();
      const data = await fetchAllPages<ExpenseRow>((from, to) => {
        let q = supabase
          .from("expenses")
          .select("expense_date, category, description, amount, supplier_id")
          .order("expense_date", { ascending: false })
          .order("id");
        if (range.start) q = q.gte("expense_date", range.start);
        if (range.key === "custom") q = q.lte("expense_date", range.end);
        if (cat) q = q.eq("category", cat);
        return q.range(from, to).overrideTypes<ExpenseRow[]>();
      });
      // أسماء الموردين بمفتاح الأدمن — الجدول مقفول في الـRLS (زي تاب المصاريف)
      const { data: suppliers } = await allRows(createAdminClient()
        .from("suppliers")
        .select("id, name")
        // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد المنع
        .eq("tenant_id", me!.tenantId));
      const supplierName = new Map((suppliers ?? []).map((x) => [x.id, x.name]));
      const total = data.reduce((s, e) => s + Number(e.amount), 0);
      return csvResponse(
        csvText(
          ["التاريخ", "النوع", "الوصف", "المورد", "المبلغ"],
          [
            ...data.map((e) => [day(e.expense_date), e.category, e.description, e.supplier_id ? supplierName.get(e.supplier_id) : "", e.amount]),
            ["", "", "", "الإجمالي", total],
          ]
        ),
        // آخر يوم في الفترة هو اللي بيتكتب في آخر الاسم
        `gridpoint-expenses-${range.start ?? "all"}`,
        range.end
      );
    }

    if (what === "cash") {
      if (!can(me, "cash.view")) {
        return new Response("مالكش صلاحية تشوف الخزنة", { status: 403 });
      }
      const dir = params.get("dir");
      // بترتيب الدفتر (الأحدث الأول) عشان الرصيد الجاري — والملف بيطلع من الأقدم
      const data = await fetchAllPages<CashRow>((from, to) =>
        supabase
          .from("cash_transactions")
          .select(
            "id, direction, amount, source_type, description, transaction_date, orders(order_number, customers(full_name)), expenses(category, description)"
          )
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .overrideTypes<CashRow[]>()
      );
      const balance = data.reduce(
        (s, r) => s + (r.direction === "in" ? 1 : r.direction === "out" ? -1 : 0) * Number(r.amount),
        0
      );
      // الرصيد الجاري على كل الحركات، وبعدين الفلتر — عشان الرقم يفضل صح
      const rows = withRunningBalance(data, balance)
        .filter((r) => !dir || r.direction === dir)
        .reverse();
      return csvResponse(
        csvText(
          ["التاريخ", "الاتجاه", "البيان", "داخل", "خارج", "الرصيد بعدها"],
          rows.map((r) => [
            day(r.transaction_date),
            r.direction === "in" ? "داخل" : "خارج",
            cashRowLabel(r),
            r.direction === "in" ? r.amount : "",
            r.direction === "out" ? r.amount : "",
            Math.round(r.balanceAfter * 100) / 100,
          ])
        ),
        "gridpoint-cash",
        today
      );
    }

    const orders = await fetchAllPages<ExportRow>((from, to) =>
      supabase
        .from("orders")
        .select(
          `order_number, order_status, order_date, delivered_at, shipping_price, archived,
           customers(full_name, phone),
           order_items(quantity, sale_price_at_order)`
        )
        .order("order_date", { ascending: false })
        .order("id")
        .range(from, to)
        .overrideTypes<ExportRow[]>()
    );

    return csvResponse(
      csvText(
        [
          "رقم الأوردر",
          "العميل",
          "التليفون",
          "التاريخ",
          "الحالة",
          "إجمالي المنتجات",
          "الشحن",
          "الإجمالي الكلي",
          "تاريخ التسليم",
          "مؤرشف",
        ],
        orders.map((order) => {
          const itemsTotal = order.order_items.reduce(
            (s, i) => s + i.quantity * i.sale_price_at_order,
            0
          );
          return [
            order.order_number,
            order.customers?.full_name,
            order.customers?.phone,
            day(order.order_date),
            orderStatusBadge(order.order_status).label,
            itemsTotal,
            order.shipping_price,
            itemsTotal + order.shipping_price,
            day(order.delivered_at),
            order.archived ? "أيوة" : "لأ",
          ];
        })
      ),
      "gridpoint-orders",
      today
    );
  } catch (e) {
    // ⚠️ ملف ناقص أوحش من مفيش ملف — أي صفحة فشلت بتوقف التنزيل كله
    return new Response("معرفناش نجهّز الملف: " + (e as Error).message, { status: 500 });
  }
}

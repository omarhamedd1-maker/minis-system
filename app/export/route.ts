// ==========================================================================
// تنزيل الداتا — نسخة عندك على جهازك
// --------------------------------------------------------------------------
// `/export`             الأوردرات (الافتراضي)
// `/export?what=customers`  العملاء
// `/export?what=products`   المنتجات وأشكالها
//
// ⚠️ **BOM في أول الملف** — من غيره إكسيل بيفتح العربي حروف مكسّرة.
// ⚠️ **والقراية بالاتصال المحمي** (`createClient`) مش بمفتاح الأدمن، فالملف
// بيطلع ببيانات البيزنس اللي داخل بس.
// ==========================================================================

import { createClient } from "@/lib/supabase/server";
import { orderStatusBadge } from "@/lib/format";
import { can, getSessionUser } from "@/lib/permissions";

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

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

/** BOM عشان Excel يقرأ العربي صح */
function csvFile(header: string[], lines: string[], name: string) {
  const csv = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!can(await getSessionUser(), "finance.export")) {
    return new Response("مالكش صلاحية تصدير البيانات", { status: 403 });
  }

  const what = new URL(request.url).searchParams.get("what") ?? "orders";

  if (what === "customers") {
    const { data, error } = await supabase
      .from("customers")
      .select("full_name, phone, city, address, created_at")
      .order("created_at", { ascending: false })
      .limit(20000)
      .overrideTypes<CustomerRow[]>();

    if (error) return new Response("Error: " + error.message, { status: 500 });

    return csvFile(
      ["الاسم", "التليفون", "المدينة", "العنوان", "أول أوردر"],
      (data ?? []).map((c) =>
        [
          csvCell(c.full_name),
          csvCell(c.phone),
          csvCell(c.city),
          csvCell(c.address),
          csvCell((c.created_at ?? "").slice(0, 10)),
        ].join(",")
      ),
      "gridpoint-customers"
    );
  }

  if (what === "products") {
    const { data, error } = await supabase
      .from("product_variants")
      .select(
        "variant_name, sku, cost_price, sale_price, quantity_on_hand, products(name, name_ar)"
      )
      .limit(20000)
      .overrideTypes<VariantRow[]>();

    if (error) return new Response("Error: " + error.message, { status: 500 });

    return csvFile(
      ["المنتج", "الشكل", "الكود", "التكلفة", "سعر البيع", "المخزون"],
      (data ?? []).map((v) =>
        [
          csvCell(v.products?.name_ar || v.products?.name),
          csvCell(v.variant_name),
          csvCell(v.sku),
          csvCell(v.cost_price ?? 0),
          csvCell(v.sale_price ?? 0),
          csvCell(v.quantity_on_hand ?? 0),
        ].join(",")
      ),
      "gridpoint-products"
    );
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `order_number, order_status, order_date, delivered_at, shipping_price, archived,
       customers(full_name, phone),
       order_items(quantity, sale_price_at_order)`
    )
    .order("order_date", { ascending: false })
    .limit(20000)
    .overrideTypes<ExportRow[]>();

  if (error) {
    return new Response("Error: " + error.message, { status: 500 });
  }

  const header = [
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
  ];

  const lines = (orders ?? []).map((order) => {
    const itemsTotal = order.order_items.reduce(
      (s, i) => s + i.quantity * i.sale_price_at_order,
      0
    );
    return [
      csvCell(order.order_number),
      csvCell(order.customers?.full_name),
      csvCell(order.customers?.phone),
      csvCell((order.order_date ?? "").slice(0, 10)),
      csvCell(orderStatusBadge(order.order_status).label),
      csvCell(itemsTotal),
      csvCell(order.shipping_price),
      csvCell(itemsTotal + order.shipping_price),
      csvCell((order.delivered_at ?? "").slice(0, 10)),
      csvCell(order.archived ? "أيوة" : "لأ"),
    ].join(",");
  });

  return csvFile(header, lines, "gridpoint-orders");
}

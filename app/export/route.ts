import { createClient } from "@/lib/supabase/server";
import { orderStatusBadge } from "@/lib/format";

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

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `order_number, order_status, order_date, delivered_at, shipping_price, archived,
       customers(full_name, phone),
       order_items(quantity, sale_price_at_order)`
    )
    .order("order_date", { ascending: false })
    .limit(5000)
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

  const lines = orders.map((order) => {
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

  // BOM عشان Excel يقرأ العربي صح
  const csv =
    "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="minis-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

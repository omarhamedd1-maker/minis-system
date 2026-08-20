// مسار خلاصة الأسبوع — بيتنادى من الكرون مرة في الأسبوع.
//
//   ?key=…      نفس مفتاح الحماية بتاع المزامنة (SYNC_KEY)
//   ?tenant=…   بيزنس واحد بس (للتجربة)
//   ?dry=1      بيرجّع النص من غير ما يبعت
//
// ⚠️ **بيلف على كل بيزنس شغّال**، وكل واحد بياخد أرقامه هو.
//
// ⚠️⚠️ **والأسبوع الفاضي مابيتبعتش** — رسالة بأصفار كل أسبوع بتخلّي الرسالة
// نفسها تتقفل، وبعدين اللي فيها خبر مايتقراش.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeTenantIds } from "@/lib/tenant-settings";
import { computeHeadline } from "@/lib/dashboard-stats";
import { notifyAll } from "@/lib/push/notify";
import { rescueQueue } from "@/lib/rescue";
import {
  weeklyDigest,
  worthSending,
  type WeekNumbers,
} from "@/lib/weekly-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** تاريخ بصيغة يوم — بتوقيت مصر */
function dayOf(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(at);
}

function shift(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86_400_000);
}

const SETTLED = ["delivered", "returned", "returned_after_delivery"];
const RETURNED = ["returned", "returned_after_delivery"];

export async function GET(request: Request) {
  const url = new URL(request.url);

  const guard = process.env.SYNC_KEY;
  if (!guard || url.searchParams.get("key") !== guard) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const dry = url.searchParams.get("dry") === "1";
  const only = url.searchParams.get("tenant");
  const db = createAdminClient();
  const now = new Date();

  // الأسبوع اللي خلص، واللي قبله
  const thisEnd = dayOf(now);
  const thisStart = dayOf(shift(now, -6));
  const lastEnd = dayOf(shift(now, -7));
  const lastStart = dayOf(shift(now, -13));

  const tenants = only ? [only] : await activeTenantIds(db);
  const out: Record<string, unknown>[] = [];

  for (const tenantId of tenants) {
    try {
      const [{ data: orders }, { data: expenses }] = await Promise.all([
        db
          .from("orders")
          .select(
            `order_status, order_date, delivered_at, shipping_price, discount,
             bosta_shipping_cost, bosta_fees_real, bosta_cod, bosta_collected,
             bosta_tracking, bosta_exception, bosta_created_at,
             customers(full_name, phone),
             order_items(quantity, sale_price_at_order, cost_price_at_order)`
          )
          .eq("tenant_id", tenantId)
          .gte("order_date", lastStart)
          .limit(3000),
        db
          .from("expenses")
          .select("category, amount, expense_date")
          .eq("tenant_id", tenantId)
          .gte("expense_date", lastStart)
          .limit(2000),
      ]);

      const rows = (orders ?? []) as never[];
      const costs = (expenses ?? []) as never[];

      const count = (from: string, to: string): WeekNumbers => {
        const head = computeHeadline(rows, costs, from, to);
        const inRange = (rows as unknown as { order_date: string | null; order_status: string | null }[])
          .filter((o) => {
            const d = String(o.order_date ?? "").slice(0, 10);
            return d >= from && d <= to;
          });
        return {
          sales: head.sales,
          net: head.netProfit,
          orders: head.orderCount,
          settled: inRange.filter((o) => SETTLED.includes(String(o.order_status))).length,
          returned: inRange.filter((o) => RETURNED.includes(String(o.order_status))).length,
        };
      };

      // اللي واقف دلوقتي — مش مربوط بالأسبوع
      const all = rows as unknown as {
        order_status: string | null;
        bosta_tracking: string | null;
        bosta_cod: number | null;
        bosta_collected: boolean | null;
        bosta_exception: string | null;
        bosta_created_at: string | null;
        customers: { full_name: string | null; phone: string | null } | null;
      }[];

      const toShip = all.filter(
        (o) =>
          ["confirmed", "packed"].includes(String(o.order_status)) &&
          !String(o.bosta_tracking ?? "").trim()
      ).length;

      const rescue = rescueQueue(
        all.map((o, i) => ({
          id: String(i),
          orderNumber: null,
          orderStatus: o.order_status,
          exception: o.bosta_exception,
          lastMoveAt: o.bosta_created_at,
          customerPhone: o.customers?.phone ?? null,
          cod: o.bosta_cod,
        })),
        now
      ).length;

      const atCarrier = all
        .filter((o) => o.order_status === "delivered" && !o.bosta_collected)
        .reduce((s, o) => s + Number(o.bosta_cod ?? 0), 0);

      const { data: tenant } = await db
        .from("tenants")
        .select("name")
        .eq("id", tenantId)
        .maybeSingle();

      const input = {
        storeName: (tenant as { name: string | null } | null)?.name ?? null,
        week: count(thisStart, thisEnd),
        before: count(lastStart, lastEnd),
        waiting: { toShip, rescue, atCarrier },
      };

      if (!worthSending(input)) {
        out.push({ tenantId, skipped: "أسبوع فاضي" });
        continue;
      }

      const text = weeklyDigest(input);
      if (dry) {
        out.push({ tenantId, text });
        continue;
      }

      await notifyAll(db, tenantId, text, { tag: `weekly-${thisEnd}` });
      out.push({ tenantId, sent: true });
    } catch (e) {
      // ⚠️ بيزنس واحد وقع مايوقّفش الباقي
      out.push({ tenantId, error: e instanceof Error ? e.message : "خطأ" });
    }
  }

  return NextResponse.json({ ok: true, week: [thisStart, thisEnd], out });
}

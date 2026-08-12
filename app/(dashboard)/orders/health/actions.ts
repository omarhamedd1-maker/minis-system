"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, can } from "@/lib/permissions";
import { cairoToday } from "@/lib/format";
import { carrierRates, leadTime, type OpsOrder } from "@/lib/ops-metrics";
import { collectionAging, type Aging } from "@/lib/collection-aging";
import {
  breakdownReturnReasons,
  type ReasonBreakdown,
} from "@/lib/return-reasons";

export type HealthReport =
  | {
      ok: true;
      rates: ReturnType<typeof carrierRates>;
      lead: ReturnType<typeof leadTime>;
      aging: Aging;
      reasons: ReasonBreakdown;
    }
  | { ok: false; error: string };

/**
 * صحة التشغيل — الأرقام اللي بتقول إيه اللي بيضيع.
 *
 * **قراية بالكامل.** كل الحساب في دوال صافية متختبرة، والصفحة دي بتجيب
 * الصفوف وبتناديهم بس.
 */
export async function loadHealth(): Promise<HealthReport> {
  const me = await getSessionUser();
  if (!me || !can(me, "finance.dashboard")) {
    return { ok: false, error: "مالكش صلاحية" };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select(
      `order_status, order_date, delivered_at, bosta_tracking, bosta_created_at,
       bosta_cod, bosta_collected, cash_received_at, return_reason,
       discount, shipping_price, order_items(quantity, sale_price_at_order)`
    )
    .eq("tenant_id", me.tenantId)
    .limit(5000);

  if (error) return { ok: false, error: "معرفناش نقرا الأوردرات" };

  const rows = (data ?? []) as unknown as OpsOrder[];

  return {
    ok: true,
    rates: carrierRates(rows),
    lead: leadTime(rows),
    aging: collectionAging(rows as never, cairoToday()),
    reasons: breakdownReturnReasons(rows as never),
  };
}

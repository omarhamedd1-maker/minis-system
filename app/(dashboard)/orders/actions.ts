"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { runOrderImport, type OrderImportResult } from "@/lib/shopify/orders";

/**
 * جلب الأوردرات والعملاء من شوبيفاي (بند ٤.٤).
 *
 * **`dry` بيعرض بس مابيكتبش.** ده أخطر استيراد في السيستم: بيعمل أوردرات
 * وعملاء وبنود، والأرقام دي بتدخل في المبيعات والأرباح على طول.
 */
export async function importShopifyOrders(
  dry: boolean
): Promise<OrderImportResult> {
  const me = await requirePermission("orders.create");
  const res = await runOrderImport({
    db: createAdminClient(),
    tenantId: me.tenantId,
    dry,
  });

  if (res.ok && !res.dry && res.added && res.added.orders > 0) {
    await logActivity(
      me,
      "orders.import",
      `جلب من شوبيفاي: ${res.added.orders} أوردر و${res.added.customers} عميل`
    );
    revalidatePath("/orders");
    revalidatePath("/customers");
  }

  return res;
}

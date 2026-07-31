"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { runOrderImport, type OrderImportResult } from "@/lib/shopify/orders";
import { recordImportRun, undoImportRun } from "@/lib/import-runs";

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
    const summary = `${res.added.orders} أوردر و${res.added.customers} عميل`;
    await logActivity(me, "orders.import", `جلب من شوبيفاي: ${summary}`);
    await recordImportRun(createAdminClient(), {
      kind: "orders",
      summary,
      actorName: me.fullName ?? me.email ?? null,
      payload: res.undo ?? {},
    });
    revalidatePath("/orders");
    revalidatePath("/customers");
  }

  return res;
}

/** بيتراجع عن عملية استيراد — بيمسح اللي اتعمل ويرجّع اللي اتغيّر */
export async function undoImport(
  runId: string
): Promise<{ ok: boolean; error?: string; removed?: number }> {
  const me = await requirePermission("orders.create");
  const res = await undoImportRun(
    createAdminClient(),
    runId,
    me.fullName ?? me.email ?? "غير معروف"
  );

  if (!res.ok) return { ok: false, error: res.error };

  await logActivity(me, "import.undo", `تراجع عن عملية استيراد (${res.removed} صف)`);
  revalidatePath("/orders");
  revalidatePath("/customers");
  revalidatePath("/products");
  revalidatePath("/settings");
  return { ok: true, removed: res.removed };
}

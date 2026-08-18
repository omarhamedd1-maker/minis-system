"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { runOrderImport, type OrderImportResult } from "@/lib/shopify/orders";
import { runProductImport } from "@/lib/shopify/products";
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

  // ⚠️⚠️ **المنتجات الأول — وده اللي بيمنع «صفر» غامضة.**
  //
  // الاستيراد **بيوقف الأوردر اللي منتجاته مش عندنا بقصد** (بند من غير
  // منتج = إجمالي غلط). يعني الزرار ده على بيزنس جديد كان بيرجّع صفر،
  // والسبب إن المنتجات لسه مااتجابتش مش إن فيه عطل.
  //
  // اللفة الدورية بقت تعمل كده (`app/api/tasks/recur`)، **بس الزرار لأ** —
  // واللي بيدوس بإيده هو أول واحد بيقع في الفخ. اتسجّل في سجل عيوب
  // التركيب (`docs/ONBOARDING.md`) من تركيب ٢ سِك.
  //
  // **والتجربة الجافة مابتجيبش منتجات** — `dry` معناها «مش هتكتب حاجة».
  if (!dry) {
    try {
      await runProductImport({ db: createAdminClient(), tenantId: me.tenantId });
    } catch {
      // جلب المنتجات وقع؟ الأوردرات تكمّل — اللي منتجه ناقص هيتقال لوحده
    }
  }

  const res = await runOrderImport({
    db: createAdminClient(),
    tenantId: me.tenantId,
    dry,
  });

  if (res.ok && !res.dry && res.added && res.added.orders > 0) {
    const summary = `${res.added.orders} أوردر و${res.added.customers} عميل`;
    await logActivity(me, "orders.import", `جلب من شوبيفاي: ${summary}`);
    await recordImportRun(createAdminClient(), {
      tenantId: me.tenantId,
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
    me.tenantId,
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

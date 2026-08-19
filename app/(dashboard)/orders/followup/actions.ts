"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { validateTemplate } from "@/lib/message-template";
import { redirect } from "next/navigation";

/**
 * علّم إن العميل اتسأل.
 *
 * ⚠️ **مافيش إرسال هنا** — الرسالة بتروح من واتساب بإيد صاحب المتجر،
 * والزرار ده بيقول «تم» بس عشان الأوردر يخرج من الطابور ومايتكررش.
 */
export async function markFollowedUp(formData: FormData): Promise<void> {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return;

  const db = createAdminClient();
  const { error } = await db
    .from("orders")
    .update({ followed_up_at: new Date().toISOString() })
    // ⚠️ الفلتر ده لازم — من غيره أوردر بيزنس تاني بنفس المعرّف يتعلّم
    .eq("tenant_id", me.tenantId)
    .eq("id", orderId);

  if (!error) {
    await logActivity(me, "order.followup", "سأل العميل بعد التسليم", orderId);
  }

  revalidatePath("/orders/followup");
}

/**
 * قالب الرسالة.
 *
 * ⚠️ **بيتفحص قبل الحفظ** — القالب اللي فيه خانة غلط بيوصل للعميل بالأقواس
 * مكتوبة زي ما هي، وده أوحش من إن الحفظ يترفض.
 *
 * ⚠️ **ومكانه هنا مش في الإعدادات بقرار عمر** — الرسالة بتتقري وبتتعدّل في
 * نفس الشاشة اللي بتتبعت منها.
 */
export async function saveFollowupTemplate(formData: FormData): Promise<void> {
  const me = await requirePermission("admin.settings");
  const template = String(formData.get("followup_template") ?? "").trim();

  const problem = validateTemplate(template);
  if (problem) {
    redirect("/orders/followup?error=" + encodeURIComponent(problem));
  }

  const db = createAdminClient();
  const { error } = await db
    .from("tenant_credentials")
    .update({
      followup_template: template,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) {
    redirect(
      "/orders/followup?error=" +
        encodeURIComponent("معرفناش نحفظ الرسالة: " + error.message)
    );
  }

  await logActivity(me, "settings.followup", "غيّر رسالة السؤال بعد التسليم");
  revalidatePath("/orders/followup");
  redirect("/orders/followup?saved=1");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { validateTemplate } from "@/lib/message-template";
import { kindInfo, mergeTemplate, type MessageKind } from "@/lib/message-kinds";
import { loadStoredTemplates } from "@/lib/message-templates-db";

/**
 * حفظ قالب رسالة واحد.
 *
 * ⚠️ **بيتفحص قبل الحفظ** — القالب اللي فيه خانة غلط بيوصل للعميل بالأقواس
 * مكتوبة زي ما هي، وده أوحش من إن الحفظ يترفض.
 *
 * ⚠️⚠️ **وبيتدمج مع اللي متخزّن مش بيستبدله** — العمود قيمة واحدة لكل
 * المواقف، فالكتابة المباشرة كانت هتمسح قوالب الشاشات التانية.
 */
export async function saveMessageTemplate(formData: FormData): Promise<void> {
  const me = await requirePermission("admin.settings");

  const kind = String(formData.get("kind") ?? "").trim() as MessageKind;
  const info = kindInfo(kind);
  const back = String(formData.get("back") ?? "/orders").trim() || "/orders";
  const text = String(formData.get("template") ?? "").trim();

  const fail = (msg: string) =>
    redirect(back + "?error=" + encodeURIComponent(msg));

  if (!info) fail("نوع الرسالة مش معروف");

  const problem = validateTemplate(text);
  if (problem) fail(problem);

  const db = createAdminClient();
  const stored = await loadStoredTemplates(db, me.tenantId);

  const patch: Record<string, unknown> = {
    message_templates: mergeTemplate(stored.templates, kind, text),
    updated_at: new Date().toISOString(),
  };
  // العمود القديم بيتحدّث كمان عشان الشاشة القديمة تفضل متطابقة
  if (kind === "followup") patch.followup_template = text;

  const { error } = await db
    .from("tenant_credentials")
    .update(patch)
    .eq("tenant_id", me.tenantId);

  if (error) fail("معرفناش نحفظ الرسالة: " + error.message);

  await logActivity(me, "settings.message", `غيّر رسالة «${info!.label}»`);
  revalidatePath(back);
  redirect(back + "?saved=1");
}

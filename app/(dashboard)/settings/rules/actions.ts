"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { checkRule, TRIGGERS } from "@/lib/automation";

function back(msg: string, ok = false): never {
  redirect(
    `/settings/rules?${ok ? "saved" : "error"}=` + encodeURIComponent(msg)
  );
}

/**
 * بيحفظ قاعدة — بيعملها أو بيعدّل حدّها.
 *
 * ⚠️ **نوع واحد لكل بيزنس** (قيد فريد في الجدول) — الحد الواحد بيكفّي،
 * والقاعدتين على نفس النوع معناهما تنبيهين على نفس الأوردر.
 */
export async function saveRule(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const trigger = String(formData.get("trigger") ?? "").trim();
  const threshold = Number(formData.get("threshold"));

  const check = checkRule({ trigger, threshold });
  if (!check.ok) back(check.reason);

  const db = createAdminClient();

  const { error } = await db.from("automation_rules").upsert(
    {
      tenant_id: me.tenantId,
      trigger,
      threshold,
      active: true,
    },
    { onConflict: "tenant_id,trigger" }
  );

  if (error) {
    back(
      "معرفناش نحفظ: " +
        error.message +
        " — لو الجدول لسه مااتعملش شغّل sql/automation-rules.sql"
    );
  }

  await logActivity(
    me,
    "rule.save",
    `ظبّط قاعدة ${TRIGGERS[trigger as keyof typeof TRIGGERS]} على ${threshold}`
  );
  revalidatePath("/settings/rules");
  back("تمام — القاعدة اتحفظت", true);
}

/**
 * بيقفل القاعدة أو بيفتحها.
 *
 * ⚠️ **بتتقفل مش بتتمسح** — الحد اللي ظبّطته بيفضل محفوظ، فلو فتحتها تاني
 * مابتبدأش من الأول.
 */
export async function toggleRule(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const id = String(formData.get("rule_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) back("مافيش قاعدة");

  const { error } = await createAdminClient()
    .from("automation_rules")
    .update({ active })
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  if (error) back("معرفناش نحفظ: " + error.message);

  await logActivity(me, "rule.toggle", active ? "فتح قاعدة" : "قفل قاعدة");
  revalidatePath("/settings/rules");
  back(active ? "القاعدة اشتغلت" : "القاعدة اتقفلت", true);
}

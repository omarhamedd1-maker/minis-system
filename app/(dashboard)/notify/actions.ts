"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/permissions";
import { checkAnnouncement, composeAnnouncement } from "@/lib/push/announce";
import { notifyPeople } from "@/lib/push/notify";

function back(msg: string, kind: "error" | "sent" = "error"): never {
  redirect(`/notify?${kind}=${encodeURIComponent(msg)}`);
}

export async function sendAnnouncement(formData: FormData) {
  const me = await requirePermission("admin.notify");

  const draft = {
    title: String(formData.get("title") ?? ""),
    details: String(formData.get("details") ?? ""),
    sender: me.fullName ?? me.email ?? "الإدارة",
  };

  const check = checkAnnouncement(draft);
  if (!check.ok) back(check.error);

  const db = createAdminClient();

  // مين اللي في البيزنس ده أصلاً — القايمة دي هي الحد الأقصى مهما جه من الفورم
  const { data: teamData } = await db
    .from("app_users")
    .select("auth_user_id, full_name")
    .eq("tenant_id", me.tenantId)
    .eq("active", true);

  const team = (teamData ?? []) as { auth_user_id: string; full_name: string | null }[];
  const nameOf = new Map(team.map((u) => [u.auth_user_id, u.full_name]));

  const toEveryone = formData.get("audience") !== "some";

  // **بنفلتر اللي جه من الفورم على قايمة البيزنس** — من غير كده حد يقدر
  // يبعت رقم مستخدم من بيزنس تاني ويوصله إشعار
  const picked = [
    ...new Set(
      formData
        .getAll("user_id")
        .map((v) => String(v ?? "").trim())
        .filter((id) => nameOf.has(id))
    ),
  ];

  const targets = toEveryone ? team.map((u) => u.auth_user_id) : picked;
  if (targets.length === 0) {
    back(
      toEveryone
        ? "مفيش حد في البيزنس يتبعتله"
        : "اختار مين يوصله الإشعار الأول"
    );
  }

  const message = composeAnnouncement(draft);

  // **الإرسال هنا بيوقف لو وقع** — عكس تنبيهات المزامنة. اللي كتب رسالة
  // بإيده لازم يعرف وصلت ولا لأ، مش يمشي فاكر إنها وصلت.
  const result = await notifyPeople(db, me.tenantId, targets, message, {
    url: "/tasks",
    // من غير تاج ثابت — كل إشعار مكتوب بإيد يستنى لوحده مايستبدلش اللي قبله
  });

  if (result.skipped === "no_keys") {
    back("مفاتيح الإشعارات مش متظبطة — افتح الإعدادات وفعّلها الأول");
  }

  const who = toEveryone
    ? "الكل"
    : picked.map((id) => nameOf.get(id)).filter(Boolean).join("، ");

  await logActivity(
    me,
    "notify.send",
    `بعت إشعار «${draft.title.trim()}» لـ${who} — وصل ${result.sent} جهاز`
  );

  revalidatePath("/notify");

  if (result.sent === 0) {
    back(
      toEveryone
        ? "محدش مفعّل الإشعارات على موبايله لسه — الرسالة ماوصلتش"
        : `${who} مفعّلش الإشعارات على موبايله — الرسالة ماوصلتش`
    );
  }

  back(`اتبعت لـ${who} — وصل ${result.sent} جهاز`, "sent");
}

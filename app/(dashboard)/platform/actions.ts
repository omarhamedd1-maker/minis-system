"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { checkNewTenant, createTenantWithOwner } from "@/lib/create-tenant";

function back(msg: string, ok = false) {
  redirect(`/platform?${ok ? "saved" : "error"}=` + encodeURIComponent(msg));
}

/**
 * حماية شاشة المنصة.
 * مش صلاحية بيزنس — أدمن أي عميل مايقدرش يوصلها مهما كانت صلاحياته.
 */
async function requirePlatformAdmin() {
  const me = await getSessionUser();
  if (!me || !me.active) redirect("/login");
  if (!me.isPlatformAdmin) redirect("/");
  return me;
}

export async function createTenant(formData: FormData) {
  const me = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ownerName = String(formData.get("owner_name") ?? "").trim();

  // نفس الفحص ونفس الإنشاء بتوع شاشة التسجيل — **مكان واحد بقصد**، عشان
  // أي تصليح أمني مايتعملش في واحد وينسى التاني
  const problem = checkNewTenant({
    businessName: name,
    ownerName,
    email,
    password,
  });
  if (problem) back(problem);

  const res = await createTenantWithOwner(createAdminClient(), {
    businessName: name,
    ownerName,
    email,
    password,
  });
  if (!res.ok) back(res.error);

  await logActivity(me, "platform.tenant.create", `أنشأ بيزنس ${name}`);
  revalidatePath("/platform");
  back(`تم إنشاء "${name}" وحساب ${email}`, true);
}

export async function setTenantActive(formData: FormData) {
  const me = await requirePlatformAdmin();
  const id = String(formData.get("tenant_id") ?? "");
  const active = String(formData.get("active") ?? "") === "1";

  if (id === me.tenantId) back("مينفعش توقف بيزنسك إنت");

  const { error } = await createAdminClient()
    .from("tenants")
    .update({ active })
    .eq("id", id);
  if (error) back("معرفناش نغيّر الحالة: " + error.message);

  await logActivity(
    me,
    "platform.tenant.active",
    active ? "فعّل بيزنس" : "وقف بيزنس"
  );
  revalidatePath("/platform");
  back(active ? "البيزنس اتفعّل" : "البيزنس اتوقف", true);
}

export async function setSubscriptionEnd(formData: FormData) {
  const me = await requirePlatformAdmin();
  const id = String(formData.get("tenant_id") ?? "");
  const date = String(formData.get("subscription_ends_at") ?? "").trim();

  const { error } = await createAdminClient()
    .from("tenants")
    .update({ subscription_ends_at: date || null })
    .eq("id", id);
  if (error) back("معرفناش نحفظ التاريخ: " + error.message);

  await logActivity(me, "platform.tenant.subscription", "عدّل نهاية الاشتراك");
  revalidatePath("/platform");
  back("تاريخ الاشتراك اتحفظ", true);
}

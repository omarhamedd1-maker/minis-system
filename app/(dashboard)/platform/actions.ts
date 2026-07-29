"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";

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

  if (!name) back("اكتب اسم البيزنس");
  if (!email.includes("@")) back("اكتب إيميل صحيح لصاحب البيزنس");
  if (password.length < 8) back("الباسورد لازم 8 حروف على الأقل");
  if (!ownerName) back("اكتب اسم صاحب البيزنس");

  const db = createAdminClient();

  // ١) البيزنس — الإعدادات والمفاتيح بتتعمل لوحدها بترجر
  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .insert({ name })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    back("معرفناش نعمل البيزنس: " + (tenantError?.message ?? ""));
  }

  // ٢) دور أساسي للبيزنس ده
  const { data: role, error: roleError } = await db
    .from("roles")
    .insert({ name: "Owner", tenant_id: tenant!.id })
    .select("id")
    .single();
  if (roleError || !role) {
    await db.from("tenants").delete().eq("id", tenant!.id);
    back("معرفناش نعمل دور للبيزنس: " + (roleError?.message ?? ""));
  }

  // ٣) حساب صاحب البيزنس
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !created?.user) {
    await db.from("tenants").delete().eq("id", tenant!.id);
    back("معرفناش نعمل الحساب: " + (authError?.message ?? ""));
  }
  const newUserId = created!.user!.id;

  // ٤) صلاحياته — كل صلاحيات بيزنسه، بس مش صاحب منصة
  const { error: userError } = await db.from("app_users").insert({
    auth_user_id: newUserId,
    full_name: ownerName,
    role_id: role!.id,
    permissions: [...ALL_PERMISSION_KEYS],
    active: true,
    tenant_id: tenant!.id,
    is_platform_admin: false,
  });
  if (userError) {
    await db.auth.admin.deleteUser(newUserId);
    await db.from("tenants").delete().eq("id", tenant!.id);
    back("معرفناش نحفظ صلاحيات الحساب: " + userError.message);
  }

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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import {
  ALL_PERMISSION_KEYS,
  requirePermission,
  type PermissionKey,
} from "@/lib/permissions";

// بناخد الصلاحيات من الفورم (checkboxes اسمها permissions) ونسيب بس المفاتيح المعروفة
function readPermissions(formData: FormData): PermissionKey[] {
  const raw = formData.getAll("permissions").map(String);
  return ALL_PERMISSION_KEYS.filter((k) => raw.includes(k));
}

function back(msg: string, ok: boolean): never {
  const q = ok ? `saved=${encodeURIComponent(msg)}` : `error=${encodeURIComponent(msg)}`;
  redirect(`/users?${q}`);
}

// نجيب رقم دور "Owner" عشان اليوزر الجديد يبقى عضو (يقدر يقرأ عبر RLS) من غير ما يبقى أدمن
async function ownerRoleId(admin: ReturnType<typeof createAdminClient>) {
  const { data: roles } = await admin
    .from("roles")
    .select("id, name")
    .overrideTypes<{ id: string; name: string | null }[]>();
  const owner =
    (roles ?? []).find((r) => (r.name ?? "").toLowerCase() === "owner") ??
    (roles ?? []).find((r) => (r.name ?? "").toLowerCase() !== "admin");
  return owner?.id ?? null;
}

export async function createUser(formData: FormData) {
  const me = await requirePermission("admin.users");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const permissions = readPermissions(formData);

  if (!email || !email.includes("@")) back("اكتب إيميل صحيح", false);
  if (password.length < 6) back("الباسورد لازم 6 حروف على الأقل", false);
  if (!fullName) back("اكتب اسم المستخدم", false);

  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !created?.user) {
    back("معرفناش نعمل اليوزر: " + (authError?.message ?? "خطأ غير معروف"), false);
  }

  const roleId = await ownerRoleId(admin);

  const { error: rowError } = await admin.from("app_users").insert({
    auth_user_id: created!.user.id,
    full_name: fullName,
    role_id: roleId,
    permissions,
    active: true,
  });
  if (rowError) {
    // نظّف اليوزر اللي اتعمل عشان مايفضلش يوزر بلا صف صلاحيات
    await admin.auth.admin.deleteUser(created!.user.id);
    back("معرفناش نحفظ صلاحيات اليوزر: " + rowError.message, false);
  }

  await logActivity(me, "user.create", `أنشأ مستخدم ${fullName} (${email})`);
  revalidatePath("/users");
  back("تم إنشاء اليوزر", true);
}

export async function updateUserPermissions(formData: FormData) {
  const me = await requirePermission("admin.users");

  const authUserId = String(formData.get("auth_user_id") ?? "");
  if (!authUserId) back("اليوزر مش موجود", false);
  const permissions = readPermissions(formData);

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("app_users")
    .select("full_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  const { error } = await admin
    .from("app_users")
    .update({ permissions })
    .eq("auth_user_id", authUserId);
  if (error) back("معرفناش نحفظ الصلاحيات: " + error.message, false);

  await logActivity(
    me,
    "user.permissions",
    `عدّل صلاحيات ${target?.full_name ?? "مستخدم"} (${permissions.length} صلاحية)`
  );
  revalidatePath("/users");
  back("تم حفظ الصلاحيات", true);
}

export async function updateUserProfile(formData: FormData) {
  const me = await requirePermission("admin.users");

  const authUserId = String(formData.get("auth_user_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const active = formData.get("active") === "1";
  if (!authUserId) back("اليوزر مش موجود", false);
  if (!fullName) back("اكتب اسم المستخدم", false);
  // منع إيقاف النفس بالغلط
  if (authUserId === me.authUserId && !active) {
    back("مينفعش توقف حسابك إنت", false);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_users")
    .update({ full_name: fullName, active })
    .eq("auth_user_id", authUserId);
  if (error) back("معرفناش نحفظ البيانات: " + error.message, false);

  await logActivity(
    me,
    "user.profile",
    `${active ? "فعّل" : "أوقف"} حساب ${fullName}`
  );
  revalidatePath("/users");
  back("تم حفظ بيانات اليوزر", true);
}

export async function setUserEmail(formData: FormData) {
  const me = await requirePermission("admin.users");

  const authUserId = String(formData.get("auth_user_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!authUserId) back("اليوزر مش موجود", false);
  if (!email || !email.includes("@")) back("اكتب إيميل صحيح", false);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    email,
    email_confirm: true,
  });
  if (error) back("معرفناش نغير الإيميل: " + error.message, false);

  await logActivity(me, "user.email", `غيّر إيميل مستخدم لـ ${email}`);
  revalidatePath("/users");
  back("تم تغيير الإيميل", true);
}

export async function setUserPassword(formData: FormData) {
  const me = await requirePermission("admin.users");

  const authUserId = String(formData.get("auth_user_id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!authUserId) back("اليوزر مش موجود", false);
  if (password.length < 6) back("الباسورد لازم 6 حروف على الأقل", false);

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("app_users")
    .select("full_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    password,
  });
  if (error) back("معرفناش نغير الباسورد: " + error.message, false);

  await logActivity(
    me,
    "user.password",
    `غيّر باسورد ${target?.full_name ?? "مستخدم"}`
  );
  revalidatePath("/users");
  back("تم تغيير الباسورد", true);
}

export async function deleteUser(formData: FormData) {
  const me = await requirePermission("admin.users");

  const authUserId = String(formData.get("auth_user_id") ?? "");
  if (!authUserId) back("اليوزر مش موجود", false);
  if (authUserId === me.authUserId) back("مينفعش تمسح حسابك إنت", false);

  const admin = createAdminClient();

  // منع مسح أدمن (حماية لصاحب النظام)
  const { data: row } = await admin
    .from("app_users")
    .select("full_name, roles(name)")
    .eq("auth_user_id", authUserId)
    .maybeSingle()
    .overrideTypes<{ full_name: string | null; roles: { name: string | null } | null }>();
  if ((row?.roles?.name ?? "").toLowerCase() === "admin") {
    back("مينفعش تمسح أدمن", false);
  }

  await admin.from("app_users").delete().eq("auth_user_id", authUserId);
  const { error } = await admin.auth.admin.deleteUser(authUserId);
  if (error) back("معرفناش نمسح اليوزر: " + error.message, false);

  await logActivity(me, "user.delete", `مسح مستخدم ${row?.full_name ?? ""}`.trim());
  revalidatePath("/users");
  back("تم مسح اليوزر", true);
}

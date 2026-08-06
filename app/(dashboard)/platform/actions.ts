"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { checkNewTenant, createTenantWithOwner } from "@/lib/create-tenant";
import { checkSlug } from "@/lib/tenant-slug";

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

/**
 * الاسم المختصر للمتجر — اللي بيبان في لينك الدخول.
 *
 * **بيتغيّر من هنا بس** (صاحب المنصة)، مش من إعدادات البيزنس: تغييره بيكسر
 * اللينك اللي التيم حافظه، وبيبقى الساب دومين بعدين. مش قرار موظف.
 */
export async function setTenantSlug(formData: FormData) {
  const me = await requirePlatformAdmin();

  const tenantId = String(formData.get("tenant_id") ?? "");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!tenantId) back("مافيش بيزنس");

  const problem = checkSlug(slug);
  if (problem) back(problem);

  const db = createAdminClient();
  const { error } = await db.from("tenants").update({ slug }).eq("id", tenantId);

  if (error) {
    // **المكرر بيرجع رسالة مفهومة** — الفهرس بيرفضه وبوستجرس بيقول
    // كلام إنجليزي عن قيد فريد
    const taken = /duplicate|unique/i.test(error.message);
    back(taken ? `«${slug}» متاخد لمتجر تاني` : "معرفناش نحفظ: " + error.message);
  }

  await logActivity(me, "tenant.slug", `غيّر الاسم المختصر لـ«${slug}»`);
  revalidatePath("/platform");
  back(`الاسم المختصر بقى «${slug}» — لينك الدخول /login/${slug}`, true);
}

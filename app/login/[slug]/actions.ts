"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopedEmail } from "@/lib/tenant-email";
import { findTenantBySlug, tenantOfAuthUser } from "@/lib/tenant-lookup";
import { rememberStore } from "@/lib/store-cookie";

function back(slug: string, msg: string): never {
  redirect(`/login/${encodeURIComponent(slug)}?error=${encodeURIComponent(msg)}`);
}

/**
 * دخول متجر معيّن.
 *
 * **الإيميل بيتبوّب باسم المتجر** (`omar+minis@…`) عشان نفس الإيميل ينفع
 * يبقى حسابين في متجرين — سوبابيز بيخلّي الإيميل فريد على المشروع كله.
 *
 * **وفيه رجوع للإيميل العادي** عشان الحسابات اللي اتعملت قبل التبويب ده
 * ماتتقفلش برّه. وساعتها بنتأكد إن المستخدم فعلًا من المتجر ده — من غير
 * الفحص ده حد من متجر تاني كان هيقدر يدخل من صفحة متجر مش بتاعه.
 */
export async function loginToStore(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!slug) redirect("/login");
  if (!email || !password) back(slug, "من فضلك اكتب الإيميل والباسورد");

  const admin = createAdminClient();
  const tenant = await findTenantBySlug(admin, slug);
  if (!tenant) back(slug, "المتجر ده مش موجود");

  const supabase = await createClient();

  // ١) الشكل المبوّب — ده اللي الحسابات الجديدة بتتعمل بيه
  const scoped = await supabase.auth.signInWithPassword({
    email: scopedEmail(email, slug),
    password,
  });

  if (!scoped.error) {
    // الجهاز يفتكر متجره — عشان لما الجلسة تخلص يرجع لباب فيه اسمه
    await rememberStore(tenant.slug);
    redirect("/");
  }

  // ٢) الشكل القديم — حساب اتعمل قبل ما التبويب يبقى موجود
  const plain = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });
  if (plain.error || !plain.data.user) back(slug, "الإيميل أو الباسورد غلط");

  // **ولازم يكون من المتجر ده** — الحساب القديم إيميله مش مبوّب، فمافيش
  // حاجة في الإيميل نفسه بتقول إنه بتاع أنهي متجر
  const his = await tenantOfAuthUser(admin, plain.data.user.id);
  if (his !== tenant.id) {
    await supabase.auth.signOut();
    back(slug, "الحساب ده مش في المتجر ده");
  }

  await rememberStore(tenant.slug);
  redirect("/");
}

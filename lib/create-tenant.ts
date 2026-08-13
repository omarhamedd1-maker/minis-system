// ==========================================================================
// إنشاء بيزنس جديد بحسابه
// --------------------------------------------------------------------------
// المكان الوحيد اللي بيعمل بيزنس، وبيتنادى من مكانين:
//
//   • شاشة التسجيل (`/signup`) — العميل بيعمل بيزنسه بنفسه
//   • شاشة البيزنسات (`/platform`) — صاحب المنصة بيعمله لحد
//
// **لازم يفضل مكان واحد.** لو اتكرر، أي تصليح أمني هيتعمل في واحد وينسى
// التاني — والفرق هنا معناه بيزنس بصلاحيات غلط.
//
// تلات حاجات مقصودة، وكلها اتعلمناها بالصعب:
//
//   ١. **رقم البيزنس بيتكتب صراحةً** في الدور والمستخدم. القيمة الافتراضية
//      في الجدولين دول ثابتة مش `current_tenant_id()`، لأن أول مستخدم في
//      بيزنس جديد لسه مالوش بيزنس وقت إنشاؤه.
//   ٢. **`is_platform_admin` بـ`false` صريح.** دي مش صلاحية بيزنس — عميل
//      عنده كل الصلاحيات مايقدرش يوصل لشاشة المنصة.
//   ٣. **أي فشل بينضّف وراه.** بيزنس من غير حساب، أو حساب من غير صلاحيات،
//      بيفضل معلّق في قاعدة البيانات ومحدش واخد باله.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_PERMISSION_KEYS } from "./permission-keys.ts";
import { checkSlug, slugify } from "./tenant-slug.ts";
import { scopedEmail } from "./tenant-email.ts";

export type NewTenantInput = {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
};

export type NewTenantResult =
  | { ok: true; tenantId: string; userId: string; slug: string }
  | { ok: false; error: string };

/**
 * اسم مختصر مقترح لبيزنس جديد.
 *
 * **الاسم العربي مالوش ترجمة** (شوف `slugify`)، فبنرجع لاسم مؤقت واضح إنه
 * مؤقت. صاحب المنصة بيغيّره من شاشة البيزنسات.
 */
export function suggestSlug(businessName: string, unique: string): string {
  const base = slugify(businessName);
  if (base && !checkSlug(base)) return base;
  return `shop-${String(unique).replace(/-/g, "").slice(0, 6).toLowerCase()}`;
}

/**
 * عمود الاسم المختصر موجود؟ (`sql/tenant-slug.sql` اتشغّل؟)
 *
 * ⚠️ **الفحص ده مش رفاهية.** من غيره، لو الملف ماتشغّلش:
 *   • إدخال البيزنس بيقع على عمود مش موجود
 *   • وأخطر: الإيميل بيتخزّن مبوّب (`omar+minis@…`) ومافيش صفحة
 *     `/login/minis` أصلًا، فصاحب البيزنس مايقدرش يدخل بحسابه خالص
 *
 * فلو العمود مش موجود بنشتغل بالسلوك القديم بالظبط.
 */
async function slugSupported(db: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await db.from("tenants").select("slug").limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** بيدوّر على اسم فاضي: `minis` ← `minis-2` ← `minis-3` */
async function freeSlug(db: SupabaseClient, wanted: string): Promise<string> {
  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? wanted : `${wanted}-${i}`;
    const { data } = await db
      .from("tenants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${wanted}-${Date.now().toString(36).slice(-4)}`;
}

/** أقل باسورد مقبول — نفس اللي شاشة البيزنسات ماشية عليه */
export const MIN_PASSWORD = 8;

/**
 * فحص البيانات قبل ما نلمس قاعدة البيانات. صافي ومتختبر.
 * الرسايل بالعربي لأن العميل هو اللي بيقراها.
 */
export function checkNewTenant(input: {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  confirm?: string;
}): string | null {
  if (!input.businessName.trim()) return "اكتب اسم البيزنس";
  if (!input.ownerName.trim()) return "اكتب اسمك";

  const email = input.email.trim().toLowerCase();
  // فحص بسيط بقصد — التأكيد الحقيقي بيحصل عند إنشاء الحساب
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "الإيميل مش مظبوط";

  if (input.password.length < MIN_PASSWORD) {
    return `الباسورد لازم ${MIN_PASSWORD} حروف على الأقل`;
  }
  if (input.confirm !== undefined && input.confirm !== input.password) {
    return "الباسوردين مش زي بعض";
  }
  return null;
}

/**
 * بيعمل البيزنس ودوره وحساب صاحبه.
 *
 * **مابيعملش تسجيل دخول** — اللي بينادي هو اللي بيقرر يعمل إيه بعد كده.
 */
export async function createTenantWithOwner(
  db: SupabaseClient,
  input: NewTenantInput
): Promise<NewTenantResult> {
  const name = input.businessName.trim();
  const ownerName = input.ownerName.trim();
  const email = input.email.trim().toLowerCase();

  // ٠) الاسم المختصر **قبل الحساب** — لأن إيميل الحساب بيتبوّب بيه، وده
  // اللي بيخلّي نفس الإيميل ينفع في متجرين
  const hasSlug = await slugSupported(db);
  const slug = hasSlug
    ? await freeSlug(db, suggestSlug(name, crypto.randomUUID()))
    : "";
  const authEmail = slug ? scopedEmail(email, slug) : email;

  // ١) الحساب الأول **بقصد**. الإيميل المكرر بيفشل هنا، ولو عملنا البيزنس
  // قبله كان هيفضل معلّق في قاعدة البيانات من غير صاحب.
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email: authEmail,
    password: input.password,
    email_confirm: true,
  });
  if (authError || !created?.user) {
    const raw = String(authError?.message ?? "");
    // رسالة سوبابيز إنجليزي — العميل لازم يفهم
    const duplicate = /already|registered|exists/i.test(raw);
    return {
      ok: false,
      error: duplicate
        ? "الإيميل ده متسجّل قبل كده — سجّل دخولك بدل ما تعمل حساب جديد"
        : "معرفناش نعمل الحساب: " + raw,
    };
  }
  const userId = created.user.id;

  // ٢) البيزنس
  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .insert(slug ? { name, slug } : { name })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    await db.auth.admin.deleteUser(userId);
    return { ok: false, error: "معرفناش نعمل البيزنس: " + (tenantError?.message ?? "") };
  }

  // ٣) دور أساسي للبيزنس ده
  const { data: role, error: roleError } = await db
    .from("roles")
    .insert({ name: "Owner", tenant_id: tenant.id })
    .select("id")
    .single();
  if (roleError || !role) {
    await db.auth.admin.deleteUser(userId);
    await db.from("tenants").delete().eq("id", tenant.id);
    return { ok: false, error: "معرفناش نعمل دور للبيزنس: " + (roleError?.message ?? "") };
  }

  // ٤) صلاحياته — كل صلاحيات بيزنسه، **بس مش صاحب منصة**
  const { error: userError } = await db.from("app_users").insert({
    auth_user_id: userId,
    full_name: ownerName,
    role_id: role.id,
    permissions: [...ALL_PERMISSION_KEYS],
    active: true,
    tenant_id: tenant.id,
    is_platform_admin: false,
  });
  if (userError) {
    await db.auth.admin.deleteUser(userId);
    // الدور قبل البيزنس — `roles.tenant_id` بـ`on delete restrict`
    await db.from("roles").delete().eq("tenant_id", tenant.id).eq("id", role.id);
    await db.from("tenants").delete().eq("id", tenant.id);
    return { ok: false, error: "معرفناش نحفظ صلاحيات الحساب: " + userError.message };
  }

  return { ok: true, tenantId: tenant.id, userId, slug };
}

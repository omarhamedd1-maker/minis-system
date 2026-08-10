// ==========================================================================
// اختبار إنشاء بيزنس جديد كامل
// --------------------------------------------------------------------------
// بيعمل بيزنس زي ما شاشة البيزنسات بتعمله بالظبط، وبيتأكد إن:
//   • الإعدادات والمفاتيح اتعملت لوحدها
//   • صاحبه بيدخل ويشوف بيزنسه بس
//   • ومايقدرش يوصل لشاشة المنصة ولا لداتا بيزنس تاني
// كل حاجة بتتمسح في الآخر.
//
//   node scripts/test-new-tenant.mjs
// ==========================================================================
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createTenantWithOwner } from "../lib/create-tenant.ts";
import { scopedEmail } from "../lib/tenant-email.ts";
import { deleteTenantCompletely } from "../lib/delete-tenant.ts";

const env = Object.fromEntries(
  fs.readFileSync("./.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EMAIL = `owner-${Date.now()}@example.com`;
const PASSWORD = "Owner!" + Math.random().toString(36).slice(2, 10);

const results = [];
const ok = (name, pass, detail = "") =>
  results.push({ الاختبار: name, النتيجة: pass ? "✅" : "❌", التفاصيل: detail });

let tenantId, roleId, authUserId;
// البيزنس التاني اللي بيتعمل بنفس الإيميل — بيتمسح في الآخر زي الأول
let dupTenantId, dupUserId;

try {
  // ===== نعمل البيزنس **بنفس الكود اللي بيشتغل فعلًا** =====
  // قبل كده السكريبت كان بيكرر الخطوات بإيده، يعني بيختبر الشكل مش اللي
  // العميل بيعدّي منه. دلوقتي بينادي نفس الدالة اللي ورا شاشة التسجيل
  // وشاشة البيزنسات — فأي كسر فيها بيبان هنا.
  const res = await createTenantWithOwner(admin, {
    businessName: "بيزنس تجريبي",
    ownerName: "صاحب البيزنس",
    email: EMAIL,
    password: PASSWORD,
  });
  if (!res.ok) throw new Error("إنشاء البيزنس فشل: " + res.error);
  tenantId = res.tenantId;
  authUserId = res.userId;

  const { data: roleRow } = await admin
    .from("roles").select("id").eq("tenant_id", tenantId).maybeSingle();
  roleId = roleRow?.id;

  // ===== ٠) **نفس الإيميل ينفع في بيزنس تاني** =====
  //
  // ده كان بيترفض قبل ٦ أغسطس، والفحص كان بيتأكد إنه بيترفض. اتغيّر بقصد:
  // الإيميل بقى بيتخزّن مبوّب باسم المتجر (`omar+minis@…`)، فالموظف اللي
  // شغّال في متجرين مايضطرش يعمل إيميل تاني.
  //
  // واللي بيتفحص هنا إن الاتنين بقوا **حسابين مختلفين فعلًا** — مش نفس
  // الحساب اتربط ببيزنسين، ده كان هيكسر العزل من أوله.
  const dup = await createTenantWithOwner(admin, {
    businessName: "بيزنس تاني بنفس الإيميل",
    ownerName: "حد تاني",
    email: EMAIL,
    password: PASSWORD,
  });
  ok(
    "نفس الإيميل ينفع في بيزنس تاني",
    dup.ok,
    dup.ok ? `اتعمل بيزنس ${dup.slug}` : dup.error
  );
  ok(
    "والاتنين حسابين مختلفين مش حساب واحد",
    dup.ok && dup.userId !== authUserId && dup.tenantId !== tenantId
  );
  if (dup.ok) {
    dupTenantId = dup.tenantId;
    dupUserId = dup.userId;
  }

  // ===== ١) صف المفاتيح اتعمل لوحده؟ =====
  const { data: c } = await admin.from("tenant_credentials").select("tenant_id").eq("tenant_id", tenantId).maybeSingle();
  ok("صف المفاتيح اتعمل لوحده", Boolean(c));

  // ===== ٢) صاحب البيزنس يدخل =====
  const owner = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  // **بالإيميل المبوّب** — ده اللي الحساب اتعمل بيه فعلًا
  const { error: signIn } = await owner.auth.signInWithPassword({
    email: scopedEmail(EMAIL, res.slug),
    password: PASSWORD,
  });
  ok("بيدخل بحسابه", !signIn, signIn?.message ?? "");

  // ===== ٣) بيشوف بيزنسه بس =====
  const { data: myTenants } = await owner.from("tenants").select("id, name");
  ok(
    "بيشوف بيزنسه هو بس",
    (myTenants ?? []).length === 1 && myTenants[0].id === tenantId,
    `رجّع ${(myTenants ?? []).length} بيزنس`
  );

  // ===== ٤) مايشوفش داتا بيزنس تاني =====
  for (const table of ["orders", "customers", "expenses", "products"]) {
    const { data } = await owner.from(table).select("tenant_id").limit(20);
    const foreign = (data ?? []).filter((r) => r.tenant_id !== tenantId);
    ok(`مايشوفش ${table} بتاع غيره`, foreign.length === 0, `${foreign.length} صف غريب`);
  }

  // ===== ٥) مفاتيح البيزنسات التانية =====
  const { data: creds } = await owner.from("tenant_credentials").select("*");
  ok("مايشوفش أي مفاتيح", (creds ?? []).length === 0, `رجّع ${(creds ?? []).length} صف`);

  // ===== ٦) مش صاحب منصة =====
  const { data: meRow } = await owner.from("app_users").select("is_platform_admin, tenant_id");
  const isPlatform = (meRow ?? [])[0]?.is_platform_admin === true;
  ok("مش صاحب منصة", !isPlatform);

  // ومايقدرش يعمل نفسه صاحب منصة
  const { data: escalate } = await owner.from("app_users")
    .update({ is_platform_admin: true }).eq("auth_user_id", authUserId).select();
  ok("مايقدرش يرقّي نفسه لصاحب منصة", (escalate ?? []).length === 0);

  // ومايقدرش يعمل بيزنس جديد
  const { error: newTenantErr } = await owner.from("tenants").insert({ name: "بيزنس مدسوس" });
  ok("مايقدرش يعمل بيزنس جديد", Boolean(newTenantErr), newTenantErr?.message.slice(0, 40) ?? "اتعمل!");

  console.table(results);
  const failed = results.filter((r) => r.النتيجة === "❌");
  console.log(
    failed.length === 0
      ? `\n✅ البيزنس الجديد اشتغل صح — ${results.length} فحص كلهم نجحوا`
      : `\n❌ فيه ${failed.length} فحص وقع`
  );
} catch (e) {
  console.log("الاختبار وقع:", e.message);
} finally {
  // **بنستخدم نفس دالة الحذف اللي الشاشة بتستخدمها** — كده لو فيها جدول
  // منسي بيبان هنا كمان، بدل ما التنظيف يمشي بترتيب تاني ويداري العيب
  for (const id of [tenantId, dupTenantId].filter(Boolean)) {
    const res = await deleteTenantCompletely(admin, id);
    if (!res.ok) console.log("⚠️ بيزنس تجريبي مااتمسحش:", res.error);
  }
  // احتياطي: لو الحساب فضل لأي سبب
  for (const id of [authUserId, dupUserId].filter(Boolean)) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  void roleId;
  console.log("\nاتمسحت البيزنسات التجريبية.");
}

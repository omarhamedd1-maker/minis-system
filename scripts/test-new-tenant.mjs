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

try {
  // ===== نعمل البيزنس بنفس خطوات الشاشة =====
  const { data: t } = await admin.from("tenants").insert({ name: "بيزنس تجريبي" }).select("id").single();
  tenantId = t.id;

  const { data: role } = await admin.from("roles").insert({ name: "Owner", tenant_id: tenantId }).select("id").single();
  roleId = role.id;

  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  authUserId = created.user.id;

  await admin.from("app_users").insert({
    auth_user_id: authUserId, full_name: "صاحب البيزنس", role_id: roleId,
    permissions: ["orders.view", "customers.view", "expenses.view", "products.view",
      "cash.view", "finance.dashboard", "admin.users", "admin.settings"],
    active: true, tenant_id: tenantId, is_platform_admin: false,
  });

  // ===== ١) الإعدادات والمفاتيح اتعملت لوحدها؟ =====
  const { data: s } = await admin.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  ok("الإعدادات اتعملت لوحدها", Boolean(s), s ? `شحن ${s.shipping_charge} · سقف تأمين ${s.fee_insurance_max}` : "مفيش");

  const { data: c } = await admin.from("tenant_credentials").select("tenant_id").eq("tenant_id", tenantId).maybeSingle();
  ok("صف المفاتيح اتعمل لوحده", Boolean(c));

  // ===== ٢) صاحب البيزنس يدخل =====
  const owner = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: signIn } = await owner.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  ok("بيدخل بحسابه", !signIn, signIn?.message ?? "");

  // ===== ٣) بيشوف بيزنسه بس =====
  const { data: myTenants } = await owner.from("tenants").select("id, name");
  ok(
    "بيشوف بيزنسه هو بس",
    (myTenants ?? []).length === 1 && myTenants[0].id === tenantId,
    `رجّع ${(myTenants ?? []).length} بيزنس`
  );

  const { data: mySettings } = await owner.from("tenant_settings").select("tenant_id");
  const foreignSettings = (mySettings ?? []).filter((r) => r.tenant_id !== tenantId);
  ok("مايشوفش إعدادات غيره", foreignSettings.length === 0, `${(mySettings ?? []).length} صف`);

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
  if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  console.log("\nاتمسح البيزنس التجريبي.");
}

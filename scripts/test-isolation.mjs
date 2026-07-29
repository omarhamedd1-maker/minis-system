// ==========================================================================
// اختبار اختراق العزل
// --------------------------------------------------------------------------
// بيعمل بيزنس وهمي بمستخدم حقيقي، وبيدخل بحسابه، وبيحاول يوصل لداتا
// البيزنس التاني بكل طريقة. كل حاجة بيعملها بتتمسح في الآخر.
//
// شغّله بعد أي تعديل بيلمس قواعد قاعدة البيانات أو الصلاحيات:
//   node scripts/test-isolation.mjs
//
// المفروض كل المحاولات تتمنع. أي "تسريب" = ثغرة لازم تتصلح فورًا،
// لأن معناها إن عميل ممكن يشوف داتا عميل تاني.
// ==========================================================================
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync("./.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MINIS = "00000000-0000-0000-0000-000000000001";
const EMAIL = `pentest-${Date.now()}@example.com`;
const PASSWORD = "Pentest!" + Math.random().toString(36).slice(2, 10);

let tenantId, authUserId, appUserId, roleId;
const results = [];
const check = (name, leaked, detail) => {
  results.push({ الاختبار: name, النتيجة: leaked ? "❌ تسريب" : "✅ اتمنع", التفاصيل: detail });
};

try {
  // ===== نجهّز بيزنس وهمي ومستخدم ليه =====
  const { data: t, error: te } = await admin
    .from("tenants").insert({ name: "بيزنس اختبار" }).select("id").single();
  if (te) throw new Error("معرفناش نعمل بيزنس: " + te.message);
  tenantId = t.id;

  const { data: au, error: ae } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (ae) throw new Error("معرفناش نعمل مستخدم: " + ae.message);
  authUserId = au.user.id;

  // كل بيزنس محتاج أدواره — دي معلومة مهمة للتركيب بعدين
  const { data: role, error: re } = await admin
    .from("roles").insert({ name: "Owner", tenant_id: tenantId }).select("id").single();
  if (re) throw new Error("معرفناش نعمل دور: " + re.message);
  roleId = role.id;

  const { data: appu, error: pe } = await admin.from("app_users").insert({
    auth_user_id: authUserId, full_name: "مخترق", tenant_id: tenantId, role_id: roleId,
    permissions: ["orders.view", "customers.view", "expenses.view", "products.view"],
    active: true,
  }).select("id").single();
  if (pe) throw new Error("معرفناش نضيف المستخدم: " + pe.message);
  appUserId = appu.id;

  console.log(`بيزنس وهمي: ${tenantId}`);
  console.log(`مستخدم وهمي: ${EMAIL}\n`);

  // ===== ندخل بالمستخدم ده زي أي عميل =====
  const attacker = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: se } = await attacker.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (se) throw new Error("معرفناش ندخل بالمستخدم: " + se.message);

  // ===== المحاولات =====
  for (const table of ["orders", "customers", "expenses", "products", "cash_transactions", "app_users", "suppliers", "shipments"]) {
    const { data, error } = await attacker.from(table).select("*").limit(5);
    const rows = data ?? [];
    // التسريب = صف تبع بيزنس تاني. صفوفه هو مش تسريب.
    const foreign = rows.filter((r) => r.tenant_id && r.tenant_id !== tenantId);
    check(
      `قراءة ${table}`,
      foreign.length > 0,
      error ? error.message.slice(0, 40)
        : `${rows.length} صف — منهم ${foreign.length} تبع بيزنس تاني`
    );
  }

  // محاولة يقرا صف بعينه برقمه
  const { data: anOrder } = await admin.from("orders").select("id, order_number").limit(1).single();
  const { data: byId } = await attacker.from("orders").select("*").eq("id", anOrder.id);
  check("قراءة أوردر برقمه بالظبط", (byId?.length ?? 0) > 0, `أوردر ${anOrder.order_number}`);

  // محاولة يعدّل أوردر مش بتاعه
  const { data: upd } = await attacker.from("orders").update({ order_status: "cancelled" }).eq("id", anOrder.id).select();
  check("تعديل أوردر مش بتاعه", (upd?.length ?? 0) > 0, "");

  // محاولة يمسح
  const { data: del } = await attacker.from("orders").delete().eq("id", anOrder.id).select();
  check("مسح أوردر مش بتاعه", (del?.length ?? 0) > 0, "");

  // محاولة يضيف صف لبيزنس مينيس
  const { error: insErr } = await attacker.from("customers")
    .insert({ full_name: "مدسوس", phone: "01099999999", tenant_id: MINIS });
  check("إضافة صف لبيزنس تاني", !insErr, insErr ? insErr.message.slice(0, 45) : "اتضاف!");

  // محاولة يغيّر بيزنسه هو عشان يشوف داتا مينيس
  const { data: esc } = await attacker.from("app_users").update({ tenant_id: MINIS }).eq("id", appUserId).select();
  check("يغيّر بيزنسه لمينيس", (esc?.length ?? 0) > 0, "");

  // بعد المحاولة دي، يقدر يشوف الأوردرات؟
  const { data: after } = await attacker.from("orders").select("id").limit(3);
  check("قراءة الأوردرات بعد محاولة التغيير", (after?.length ?? 0) > 0, `رجّع ${after?.length ?? 0}`);

  // محاولة يقرا جدول البيزنسات كله
  const { data: allT } = await attacker.from("tenants").select("*");
  check("قراءة كل البيزنسات", (allT?.length ?? 0) > 1, `رجّع ${allT?.length ?? 0} بيزنس`);

  // ===== أخطر محاولة: مفاتيح البيزنسات التانية =====
  const { data: creds, error: credErr } = await attacker.from("tenant_credentials").select("*");
  check(
    "قراءة مفاتيح بوسطة وشوبيفاي",
    (creds?.length ?? 0) > 0,
    credErr ? credErr.message.slice(0, 40) : `رجّع ${creds?.length ?? 0} صف`
  );

  // كان فيه هنا محاولة على جدول الإعدادات — الجدول اتشال، والمحاولة اتشالت
  // معاه لأنها كانت بتقول "اتمنع" على جدول مش موجود أصلًا.

  console.table(results);
  const leaks = results.filter((r) => r.النتيجة.includes("تسريب"));
  console.log(leaks.length === 0
    ? `\n✅ العزل صامد — ${results.length} محاولة كلها اتمنعت`
    : `\n❌ فيه ${leaks.length} تسريب لازم يتصلح`);
} catch (e) {
  console.log("الاختبار وقع:", e.message);
} finally {
  // ===== تنضيف =====
  if (appUserId) await admin.from("app_users").delete().eq("id", appUserId);
  if (roleId) await admin.from("roles").delete().eq("id", roleId);
  if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  console.log("\nاتمسح البيزنس والمستخدم الوهميين.");
}

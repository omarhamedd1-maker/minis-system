// ==========================================================================
// فحص حذف البيزنس — بيعمل بيزنس حقيقي بداتا، يمسحه، ويدوّر على أي صف فاضل
// --------------------------------------------------------------------------
//   node scripts/test-delete-tenant.mjs
//
// **بيشتغل على قاعدة البيانات الحقيقية** — بس على بيزنس بيعمله بنفسه
// وبيمسحه في الآخر. مابيلمسش أي بيزنس تاني خالص.
//
// السبب إنه سكريبت مش اختبار عادي: الترتيب اللي بيتفحص هنا هو ترتيب
// المفاتيح الأجنبية في قاعدة البيانات الحقيقية — ونسخة وهمية منها
// مش هتكشف إن جدول اتنسي.
// ==========================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  TENANT_TABLES,
  countTenantRows,
  deleteTenantCompletely,
} from "../lib/delete-tenant.ts";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.replace(/^﻿/, "").match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
const ok = (name, pass, detail = "") =>
  results.push({ الفحص: name, النتيجة: pass ? "✅" : "❌", التفاصيل: detail });

const stamp = Date.now();
let tenantId = null;
let authUserId = null;

try {
  // ===== ١) بيزنس تجريبي بداتا حقيقية =====
  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .insert({ name: `فحص الحذف ${stamp}`, slug: `del-test-${stamp}`.slice(0, 32) })
    .select("id")
    .single();
  if (tErr) throw new Error("معرفناش نعمل البيزنس: " + tErr.message);
  tenantId = tenant.id;

  const { data: role } = await db
    .from("roles")
    .insert({ name: "Owner", tenant_id: tenantId })
    .select("id")
    .single();

  const { data: user } = await db.auth.admin.createUser({
    email: `del-test-${stamp}@example.com`,
    password: "test-password-123",
    email_confirm: true,
  });
  authUserId = user?.user?.id ?? null;

  await db.from("app_users").insert({
    auth_user_id: authUserId,
    full_name: "حساب فحص",
    role_id: role?.id,
    permissions: [],
    active: true,
    tenant_id: tenantId,
    is_platform_admin: false,
  });

  // داتا في الجداول اللي ليها أبناء — دي اللي بتكشف ترتيب المسح
  const { data: customer } = await db
    .from("customers")
    .insert({ full_name: "عميل فحص", phone: `0100${stamp}`.slice(0, 11), tenant_id: tenantId })
    .select("id")
    .single();

  const { data: order } = await db
    .from("orders")
    .insert({
      order_number: `del-${stamp}`,
      customer_id: customer?.id,
      order_status: "new",
      shipping_price: 0,
      discount: 0,
      tenant_id: tenantId,
    })
    .select("id")
    .single();

  await db.from("order_items").insert({
    order_id: order?.id,
    quantity: 1,
    sale_price_at_order: 100,
    cost_price_at_order: 50,
    tenant_id: tenantId,
  });

  const { data: task } = await db
    .from("tasks")
    .insert({ title: "تاسك فحص", tenant_id: tenantId })
    .select("id")
    .single();
  await db.from("task_steps").insert({
    task_id: task?.id,
    title: "خطوة",
    position: 0,
    tenant_id: tenantId,
  });
  await db.from("expenses").insert({
    amount: 10,
    category: "فحص",
    tenant_id: tenantId,
  });

  const before = await countTenantRows(db, tenantId);
  const rowsBefore = before.counts.reduce((s, c) => s + c.rows, 0);
  ok("البيزنس التجريبي اتعمل بداتا", rowsBefore > 0 && before.users === 1,
    `${rowsBefore} صف · ${before.users} حساب`);

  // ===== ٢) المسح =====
  const res = await deleteTenantCompletely(db, tenantId);
  ok("المسح رجع نجاح", res.ok, res.error ?? "");

  // ===== ٣) مفيش صف فاضل في أي جدول =====
  let leftovers = 0;
  const leftTables = [];
  for (const table of TENANT_TABLES) {
    const { count, error } = await db
      .from(table)
      .select("tenant_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (!error && (count ?? 0) > 0) {
      leftovers += count;
      leftTables.push(`${table}(${count})`);
    }
  }
  ok("مفيش صف فاضل في أي جدول", leftovers === 0,
    leftovers ? leftTables.join(" · ") : "كله اتمسح");

  // ===== ٤) الأدوار والحسابات =====
  const { count: rolesLeft } = await db
    .from("roles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  ok("الأدوار اتمسحت", (rolesLeft ?? 0) === 0, `فاضل ${rolesLeft ?? 0}`);

  const { count: usersLeft } = await db
    .from("app_users").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  ok("الحسابات اتمسحت من الجدول", (usersLeft ?? 0) === 0, `فاضل ${usersLeft ?? 0}`);

  // **الحساب لازم يتمسح من نظام الدخول كمان** — لو فضل، بيقدر يسجّل دخول
  // ويقع على شاشة بيضا
  let authGone = false;
  try {
    const { data: still } = await db.auth.admin.getUserById(authUserId);
    authGone = !still?.user;
  } catch {
    authGone = true;
  }
  ok("الحساب اتمسح من نظام الدخول", authGone, authGone ? "" : "لسه موجود!");
  if (authGone) authUserId = null;

  // ===== ٥) البيزنس نفسه =====
  const { data: stillThere } = await db
    .from("tenants").select("id").eq("id", tenantId).maybeSingle();
  ok("البيزنس نفسه اتمسح", !stillThere, stillThere ? "لسه موجود!" : "");
  if (!stillThere) tenantId = null;
} catch (e) {
  ok("السكريبت مشي لآخره", false, e.message);
}

// ===== تنظيف لو حاجة وقعت في النص =====
if (tenantId || authUserId) {
  console.log("\n⚠️ الفحص وقع في النص — بننضّف اللي اتعمل");
  if (authUserId) {
    await db.from("app_users").delete().eq("auth_user_id", authUserId);
    await db.auth.admin.deleteUser(authUserId).catch(() => {});
  }
  if (tenantId) {
    for (const t of TENANT_TABLES) {
      await db.from(t).delete().eq("tenant_id", tenantId);
    }
    await db.from("roles").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
}

console.table(results);
const failed = results.filter((r) => r.النتيجة === "❌").length;
console.log(
  failed === 0
    ? `\n✅ حذف البيزنس شغال صح — ${results.length} فحص كلهم نجحوا`
    : `\n❌ ${failed} فحص فشلوا`
);
process.exit(failed === 0 ? 0 : 1);

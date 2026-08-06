// ==========================================================================
// حذف بيزنس بالكامل
// --------------------------------------------------------------------------
// **أخطر عملية في السيستم كله** — بتمسح أوردرات وفلوس وعملاء بيزنس كامل،
// ومافيش رجوع. عشان كده الملف ده مبني على تلات قواعد:
//
//   ١. **العرض قبل التنفيذ إجباري.** `dry` بترجّع عدّاد كل جدول من غير ما
//      تلمس صف واحد، والشاشة بتوريه قبل ما تسأل التأكيد.
//   ٢. **الترتيب مكتوب صراحةً**، مش متروك لقاعدة البيانات. `roles.tenant_id`
//      بـ`on delete restrict`، فالدور لازم يتمسح قبل البيزنس وإلا بيفضل
//      بيزنس معلّق. والأبناء قبل الآباء عشان المفاتيح الأجنبية.
//   ٣. **بيزنسك مايتمسحش أبدًا** — الفحص ده في الأكشن مش هنا كمان.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ترتيب المسح — **الأبناء الأول**.
 *
 * أي جدول جديد فيه `tenant_id` لازم يتضاف هنا، وإلا بيفضل صفوفه في قاعدة
 * البيانات بعد ما البيزنس يتمسح — داتا يتيمة محدش شايفها.
 *
 * `app_users` و`roles` و`tenants` **مش في القايمة دي بقصد** — ليهم خطوات
 * خاصة في الآخر (الحسابات لازم تتمسح من نظام الدخول كمان).
 */
export const TENANT_TABLES = [
  // أبناء الأوردر
  "order_items",
  "shipments",
  // أبناء التاسك
  "task_steps",
  "task_comments",
  "task_assignees",
  // أبناء المورد والمنتج
  "supplier_transactions",
  "product_variants",
  // الأصول
  "orders",
  "tasks",
  "customers",
  "products",
  "suppliers",
  "expenses",
  "cash_movements",
  // سجلات
  "activity_log",
  "import_runs",
  "sync_runs",
  "push_subscriptions",
  "tenant_credentials",
] as const;

export type DeleteCount = { table: string; rows: number };

export type DeleteTenantResult = {
  ok: boolean;
  /** إيه اللي اتمسح (أو هيتمسح في وضع العرض) */
  counts: DeleteCount[];
  users: number;
  error?: string;
};

/**
 * التأكيد لازم يطابق اسم البيزنس **حرف بحرف**.
 *
 * مش زرار «متأكد؟» — الزرار ده بيتداس بالغلط. كتابة الاسم بتخلّي الواحد
 * يبص على اللي هيمسحه فعلًا.
 */
export function confirmMatches(typed: string, name: string): boolean {
  return String(typed ?? "").trim() === String(name ?? "").trim() && !!name.trim();
}

/** بيعدّ الصفوف من غير ما يلمس حاجة — ده اللي الشاشة بتعرضه */
export async function countTenantRows(
  db: SupabaseClient,
  tenantId: string
): Promise<{ counts: DeleteCount[]; users: number }> {
  const counts: DeleteCount[] = [];

  for (const table of TENANT_TABLES) {
    const { count, error } = await db
      .from(table)
      .select("tenant_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    // جدول مش موجود في المشروع ده؟ نعدّي
    if (!error && (count ?? 0) > 0) counts.push({ table, rows: count ?? 0 });
  }

  const { count: users } = await db
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  return { counts, users: users ?? 0 };
}

/**
 * بيمسح البيزنس وكل حاجة تحته.
 *
 * **مافيش معاملة (transaction) هنا** — سوبابيز مابيديش واحدة من الكود.
 * فالترتيب متظبّط إن أي فشل في النص يسيب البيزنس نفسه موجود بدل ما يسيب
 * صفوف يتيمة: البيزنس آخر حاجة تتمسح.
 */
export async function deleteTenantCompletely(
  db: SupabaseClient,
  tenantId: string
): Promise<DeleteTenantResult> {
  const before = await countTenantRows(db, tenantId);

  // ١) كل الجداول التابعة، بالترتيب
  for (const table of TENANT_TABLES) {
    const { error } = await db.from(table).delete().eq("tenant_id", tenantId);
    // الجدول مش موجود؟ نكمّل. غير كده نقف — عشان مانسيبش داتا يتيمة
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      return {
        ok: false,
        counts: before.counts,
        users: before.users,
        error: `وقفنا عند «${table}»: ${error.message}`,
      };
    }
  }

  // ٢) ملفات التاسكات — مسارها بيبدأ برقم البيزنس
  try {
    const { data: files } = await db.storage.from("task-files").list(tenantId);
    const paths = (files ?? []).map((f) => `${tenantId}/${f.name}`);
    if (paths.length > 0) await db.storage.from("task-files").remove(paths);
  } catch {
    // الملفات مش هتمنع الحذف — أسوأ حاجة ملفات سايبة في التخزين
  }

  // ٣) الحسابات — **من الجدول ومن نظام الدخول**. لو اتمسح من الجدول بس،
  // الحساب بيفضل يقدر يسجّل دخول ويقع على شاشة بيضا
  const { data: people } = await db
    .from("app_users")
    .select("auth_user_id")
    .eq("tenant_id", tenantId);

  for (const p of (people ?? []) as { auth_user_id: string | null }[]) {
    if (p.auth_user_id) {
      try {
        await db.auth.admin.deleteUser(p.auth_user_id);
      } catch {
        // الحساب مش موجود عند سوبابيز خلاص؟ نكمّل
      }
    }
  }
  await db.from("app_users").delete().eq("tenant_id", tenantId);

  // ٤) الأدوار **قبل** البيزنس — `roles.tenant_id` بـ`on delete restrict`،
  // ومن غير الترتيب ده البيزنس بيفضل معلّق
  const { error: roleError } = await db
    .from("roles")
    .delete()
    .eq("tenant_id", tenantId);
  if (roleError) {
    return {
      ok: false,
      counts: before.counts,
      users: before.users,
      error: "معرفناش نمسح أدوار البيزنس: " + roleError.message,
    };
  }

  // ٥) البيزنس نفسه
  const { error } = await db.from("tenants").delete().eq("id", tenantId);
  if (error) {
    return {
      ok: false,
      counts: before.counts,
      users: before.users,
      error: "معرفناش نمسح البيزنس: " + error.message,
    };
  }

  return { ok: true, counts: before.counts, users: before.users };
}

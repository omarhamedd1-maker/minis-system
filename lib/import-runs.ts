// ==========================================================================
// سجل الاستيراد والتراجع عنه
// --------------------------------------------------------------------------
// الجلب من شوبيفاي بيعمل أوردرات وعملاء ومنتجات دفعة واحدة. من غير سجل،
// الرجوع بيبقى شغل يدوي في قاعدة البيانات — وده بالظبط اللي المفروض العميل
// الجديد مايعملهوش.
//
// كل عملية بتتسجّل ومعاها **اللي عملته بالظبط**، فالتراجع ضغطة زرار.
//
// **التسجيل مايوقفش الاستيراد.** لو الجدول لسه ماتعملش (`sql/import-runs.sql`)
// الاستيراد بيكمّل عادي من غير سجل — استيراد من غير سجل أهون من استيراد بيقع.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportKind = "products" | "orders" | "shipments" | "costs";

export type ImportPayload = {
  products?: string[];
  variants?: string[];
  orders?: string[];
  customers?: string[];
  /** شحنات اتربطت — الرجوع إن رقم التتبع يترجع فاضي */
  trackings?: { orderId: string }[];
  /** تكاليف اتغيّرت — الرجوع إنها ترجع لقيمتها القديمة */
  costs?: { variantId: string; previous: number }[];
};

export type ImportRun = {
  id: string;
  kind: ImportKind;
  summary: string;
  actor_name: string | null;
  payload: ImportPayload;
  created_at: string;
  undone_at: string | null;
  undone_by: string | null;
};

/** فيه حاجة يتراجع عنها أصلًا؟ */
export function payloadCount(p: ImportPayload): number {
  return (
    (p.products?.length ?? 0) +
    (p.variants?.length ?? 0) +
    (p.orders?.length ?? 0) +
    (p.customers?.length ?? 0) +
    (p.trackings?.length ?? 0) +
    (p.costs?.length ?? 0)
  );
}

/** وصف اللي هيترجع — بيتعرض قبل ما المستخدم يأكد */
export function describeUndo(p: ImportPayload): string[] {
  const out: string[] = [];
  if (p.orders?.length) out.push(`${p.orders.length} أوردر هيتمسحوا`);
  if (p.customers?.length)
    out.push(`${p.customers.length} عميل هيتمسحوا (اللي مالوش أوردرات تانية)`);
  if (p.products?.length) out.push(`${p.products.length} منتج هيتمسحوا`);
  if (p.variants?.length) out.push(`${p.variants.length} شكل هيتمسح`);
  if (p.trackings?.length)
    out.push(`${p.trackings.length} رقم تتبع هيتفكّ من أوردره`);
  if (p.costs?.length) out.push(`${p.costs.length} تكلفة هترجع لقيمتها القديمة`);
  return out;
}

/**
 * بيسجّل عملية استيراد. **الفشل مايوقفش الاستيراد** — زي `logActivity`.
 */
export async function recordImportRun(
  db: SupabaseClient,
  run: {
    kind: ImportKind;
    summary: string;
    actorName: string | null;
    payload: ImportPayload;
    /**
     * البيزنس صاحب الاستيراد.
     *
     * ⚠️ **لازم يتبعت.** `db` هنا بمفتاح الأدمن، والقيمة الافتراضية في
     * الداتابيز بتقرا المستخدم الداخل — ومفيش مستخدم مع المفتاح ده،
     * فبترجّع **مينيز**. يعني سجل استيراد أي بيزنس تاني كان بينزل عند عمر،
     * **والتراجع بيبقى متاح للناس الغلط**.
     */
    tenantId: string;
  }
): Promise<void> {
  try {
    await db.from("import_runs").insert({
      tenant_id: run.tenantId,
      kind: run.kind,
      summary: run.summary,
      actor_name: run.actorName,
      payload: run.payload,
    });
  } catch {
    // الجدول لسه ماتعملش — مش مشكلة توقف الاستيراد
  }
}

export async function listImportRuns(
  db: SupabaseClient,
  /** البيزنس — من غيره الشاشة بتعرض عمليات بيزنسات تانية */
  tenantId: string,
  limit = 20
): Promise<ImportRun[]> {
  try {
    const { data, error } = await db
      .from("import_runs")
      .select("id, kind, summary, actor_name, payload, created_at, undone_at, undone_by")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .overrideTypes<ImportRun[]>();
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export type UndoResult =
  | { ok: true; removed: number }
  | { ok: false; error: string };

/**
 * بيتراجع عن عملية استيراد.
 *
 * **الترتيب مهم**: البنود قبل الأوردرات، والأشكال قبل المنتجات — وإلا
 * قاعدة البيانات بترفض المسح عشان فيه صفوف معلّقة عليه.
 *
 * **والعميل مابيتمسحش إلا لو مالوش أوردرات تانية.** ممكن يكون عنده أوردر
 * قديم من قبل الاستيراد، ومسحه هيضيّع تاريخه.
 */
export async function undoImportRun(
  db: SupabaseClient,
  /**
   * البيزنس صاحب العملية.
   *
   * ⚠️⚠️ **ده أخطر مكان في الملف.** التراجع **بيمسح** أوردرات وعملاء
   * ومنتجات وحركات مخزون. و`runId` جاي من الشاشة — يعني من غير الفلتر ده،
   * مستخدم في بيزنس كان يقدر يبعت رقم عملية بيزنس تاني **ويمسح بضاعته**.
   */
  tenantId: string,
  runId: string,
  actorName: string
): Promise<UndoResult> {
  const { data: run, error } = await db
    .from("import_runs")
    .select("id, payload, undone_at")
    .eq("tenant_id", tenantId)
    .eq("id", runId)
    .maybeSingle()
    .overrideTypes<{ id: string; payload: ImportPayload; undone_at: string | null }>();

  if (error) return { ok: false, error: "معرفناش نقرا العملية: " + error.message };
  if (!run) return { ok: false, error: "العملية دي مش موجودة" };
  if (run.undone_at) return { ok: false, error: "اتعمل لها تراجع خلاص" };

  const p = run.payload ?? {};
  let removed = 0;

  // ١) الأوردرات: بنودها الأول
  if (p.orders?.length) {
    await db
      .from("order_items")
      .delete()
      .eq("tenant_id", tenantId)
      .in("order_id", p.orders);
    await db
      .from("cash_transactions")
      .delete()
      .eq("tenant_id", tenantId)
      .in("related_order_id", p.orders);
    const { count } = await db
      .from("orders")
      .delete({ count: "exact" })
      .eq("tenant_id", tenantId)
      .in("id", p.orders);
    removed += count ?? 0;
  }

  // ٢) العملاء — اللي مالوش أوردرات تانية بس
  for (const customerId of p.customers ?? []) {
    const { count: still } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId);
    if ((still ?? 0) === 0) {
      const { count } = await db
        .from("customers")
        .delete({ count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("id", customerId);
      removed += count ?? 0;
    }
  }

  // ٣) الأشكال قبل المنتجات
  const variantIds = [...(p.variants ?? [])];
  if (p.products?.length) {
    const { data: theirVariants } = await db
      .from("product_variants")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("product_id", p.products)
      .overrideTypes<{ id: string }[]>();
    for (const v of theirVariants ?? []) variantIds.push(v.id);
  }

  if (variantIds.length > 0) {
    await db
      .from("stock_movements")
      .delete()
      .eq("tenant_id", tenantId)
      .in("variant_id", variantIds);
    const { count } = await db
      .from("product_variants")
      .delete({ count: "exact" })
      .eq("tenant_id", tenantId)
      .in("id", variantIds);
    removed += count ?? 0;
  }

  if (p.products?.length) {
    const { count } = await db
      .from("products")
      .delete({ count: "exact" })
      .eq("tenant_id", tenantId)
      .in("id", p.products);
    removed += count ?? 0;
  }

  // ٤) الشحنات: رقم التتبع يترجع فاضي
  for (const t of p.trackings ?? []) {
    const { count } = await db
      .from("orders")
      .update({ bosta_tracking: null }, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("id", t.orderId);
    removed += count ?? 0;
  }

  // ٥) التكاليف ترجع زي ما كانت
  for (const c of p.costs ?? []) {
    const { count } = await db
      .from("product_variants")
      .update({ cost_price: c.previous }, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("id", c.variantId);
    removed += count ?? 0;
  }

  await db
    .from("import_runs")
    .update({ undone_at: new Date().toISOString(), undone_by: actorName })
    .eq("tenant_id", tenantId)
    .eq("id", runId);

  return { ok: true, removed };
}

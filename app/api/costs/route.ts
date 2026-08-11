// ==========================================================================
// تنزيل ملف التكاليف
// --------------------------------------------------------------------------
//   GET /api/costs            كل الأشكال
//   GET /api/costs?missing=1  اللي تكلفته صفر بس
//
// الملف بيتفتح في إكسيل على طول — BOM وفاصلة منقوطة (التفاصيل في
// `lib/costs-file.ts`).
// ==========================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { can, getSessionUser } from "@/lib/permissions";
import { buildCostFile, type CostFileRow } from "@/lib/costs-file";
import { LEGACY_BUCKET_PRODUCT } from "@/lib/format";

export async function GET(request: Request) {
  const me = await getSessionUser();
  if (!me || !can(me, "products.edit")) {
    return new Response("مالكش صلاحية", { status: 403 });
  }

  const onlyMissing = new URL(request.url).searchParams.get("missing") === "1";
  const db = createAdminClient();

  // ⚠️ **الفلتر ده مش زيادة.** المفتاح ده بيعدّي على الـRLS، ومن غيره الملف
  // بينزّل تكاليف وأسعار **كل البيزنسات** لأي حد معاه صلاحية المنتجات.
  const { data, error } = await db
    .from("product_variants")
    .select("id, variant_name, sku, sale_price, cost_price, products(name, name_ar)")
    .eq("tenant_id", me.tenantId)
    .overrideTypes<
      {
        id: string;
        variant_name: string | null;
        sku: string | null;
        sale_price: number;
        cost_price: number;
        products: { name: string | null; name_ar: string | null } | null;
      }[]
    >();

  if (error) {
    return new Response("معرفناش نقرا المنتجات: " + error.message, {
      status: 500,
    });
  }

  const rows: CostFileRow[] = (data ?? [])
    // صندوق تجميع الأوردرات القديمة مش منتج — مالوش تكلفة تتكتب
    .filter((v) => v.products?.name !== LEGACY_BUCKET_PRODUCT)
    .filter((v) => !onlyMissing || !(Number(v.cost_price) > 0))
    .map((v) => ({
      variantId: v.id,
      sku: v.sku,
      // الاسم العربي أولى — هو اللي العميل بيعرف بيه منتجه
      productName: v.products?.name_ar || v.products?.name || "بدون اسم",
      variantName: v.variant_name,
      salePrice: Number(v.sale_price ?? 0),
      costPrice: Number(v.cost_price ?? 0),
    }))
    .sort((a, b) => {
      const na = Number(a.sku);
      const nb = Number(b.sku);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.sku ?? "").localeCompare(String(b.sku ?? ""));
    });

  const name = onlyMissing ? "التكاليف-الناقصة" : "التكاليف";

  return new Response(buildCostFile(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.csv`,
      "Cache-Control": "no-store",
    },
  });
}

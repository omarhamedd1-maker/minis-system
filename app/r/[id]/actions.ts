"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkStars } from "@/lib/rating";
import { looksLikeOrderId } from "@/lib/tracking-view";

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * بيسجّل تقييم العميل.
 *
 * ⚠️⚠️ **القراية بمفتاح الأدمن من غير فلتر بيزنس مقصودة** — العميل مالوش
 * بيزنس ولا حساب، ومعرّف الأوردر (`uuid`) هو اللي بيحدده لوحده. الحارس
 * بيسمح للملف ده بالاسم، زي `/track` و`/o` بالظبط.
 *
 * ⚠️ **والبيزنس بيتاخد من الأوردر نفسه** — مش من اللي بيبعت. لو أخدناه
 * من الصفحة، أي حد يقدر يسجّل تقييم على بيزنس تاني.
 *
 * ⚠️ **ومرة واحدة لكل أوردر** (قيد فريد في الجدول) — لو العميل قدر يقيّم
 * عشر مرات، أول واحد زعلان بيقلب متوسط المنتج لوحده.
 */
export async function saveRating(formData: FormData): Promise<SaveResult> {
  const id = String(formData.get("order_id") ?? "").trim();
  const stars = checkStars(formData.get("stars"));
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 500);

  if (!looksLikeOrderId(id)) return { ok: false, error: "Link is not valid." };
  if (stars === null) return { ok: false, error: "Pick a rating first." };

  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select("id, tenant_id, order_status")
    .eq("id", id)
    .maybeSingle();

  const row = order as
    | { id: string; tenant_id: string; order_status: string | null }
    | null;

  // ⚠️ **رد واحد** سواء الأوردر مش موجود أو لسه مااتسلّمش — اللي بيجرّب
  // مايعرفش إيه اللي موجود وإيه اللي لأ
  if (!row) return { ok: false, error: "Link is not valid." };

  const { error } = await db.from("order_ratings").insert({
    tenant_id: row.tenant_id,
    order_id: row.id,
    stars,
    comment: comment || null,
  });

  if (error) {
    // 23505 = اتقيّم قبل كده — ده مش عطل
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "You already rated this order. Thank you!" };
    }
    return { ok: false, error: "Could not save your rating." };
  }

  return { ok: true };
}

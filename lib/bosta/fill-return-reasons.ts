// ==========================================================================
// جيب أسباب الرجوع من بوسطة وحطّها على الأوردرات
// --------------------------------------------------------------------------
// شاشة «رجعوا ليه؟» كانت فاضية تمامًا: ٤٩ شحنة راجعة و**صفر سبب متسجّل**،
// لأن الخانة بتتملى بالإيد ومحدش بيملاها. وبوسطة عندها السبب أصلًا في
// `state.exception[]`.
//
// ⚠️ **كل شحنة نداء لوحدها** — مسار البحث الجماعي مابيرجّعش المحاولات، فلازم
// نجيب الشحنة بنفسها. عشان كده فيه حد أقصى لكل تشغيلة، والباقي بيتعمل في
// التشغيلة اللي بعدها.
//
// ⚠️⚠️ **مابنكتبش فوق سبب متكتب بالإيد.** لو صاحب المتجر كلّم العميل وعرف
// السبب الحقيقي، رأي المندوب مايمسحوش.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { returnReasonFromBosta, type BostaAttemptIn } from "./return-reason";
import { RETURNED_STATUSES } from "../return-reasons";

/** أقصى عدد شحنات في التشغيلة الواحدة — نداء لكل واحدة */
export const MAX_PER_RUN = 60;

export type FillResult = {
  /** اتفحص كام أوردر */
  checked: number;
  /** اتحط عليه سبب */
  filled: number;
  /** بوسطة مالهاش سبب مسجّل عليه */
  noReason: number;
  /** الشحنة نفسها مالقيناهاش عند بوسطة */
  notFound: number;
};

type Deps = {
  /** بيرجّع محاولات بوسطة لشحنة — أو `null` لو الشحنة مش موجودة */
  fetchAttempts: (tracking: string) => Promise<BostaAttemptIn[] | null>;
};

/**
 * بيملا سبب الرجوع للأوردرات الراجعة اللي لسه من غير سبب.
 *
 * الدالة دي بتلمس الشبكة وقاعدة البيانات، فالجزء اللي بيقرر السبب متفصول في
 * `return-reason.ts` وهو المتختبر.
 */
export async function fillReturnReasons(
  db: SupabaseClient,
  tenantId: string,
  deps: Deps
): Promise<FillResult> {
  const out: FillResult = { checked: 0, filled: 0, noReason: 0, notFound: 0 };

  const { data, error } = await db
    .from("orders")
    .select("id, bosta_tracking")
    .eq("tenant_id", tenantId)
    .in("order_status", RETURNED_STATUSES)
    .is("return_reason", null)
    .not("bosta_tracking", "is", null)
    .limit(MAX_PER_RUN);

  if (error) return out;

  for (const row of (data ?? []) as { id: string; bosta_tracking: string }[]) {
    const tracking = String(row.bosta_tracking ?? "").trim();
    if (!tracking) continue;

    out.checked++;

    let attempts: BostaAttemptIn[] | null = null;
    try {
      attempts = await deps.fetchAttempts(tracking);
    } catch {
      // شحنة واحدة وقعت؟ نكمّل الباقي — الفشل الكامل أوحش من ناقص واحد
      out.notFound++;
      continue;
    }

    if (attempts === null) {
      out.notFound++;
      continue;
    }

    const reason = returnReasonFromBosta(attempts);
    if (!reason) {
      out.noReason++;
      continue;
    }

    const { error: upErr } = await db
      .from("orders")
      .update({ return_reason: reason })
      // ⚠️ الفلتر ده لازم — من غيره أوردر بيزنس تاني بنفس المعرّف يتكتب عليه
      .eq("tenant_id", tenantId)
      .eq("id", row.id)
      // ⚠️ وده بيمنع الكتابة فوق سبب اتكتب بالإيد بين القراية والكتابة
      .is("return_reason", null);

    if (!upErr) out.filled++;
  }

  return out;
}

/** خلاصة بالعربي للشاشة */
export function fillSummary(r: FillResult): string {
  if (r.checked === 0) return "كل الشحنات الراجعة عليها سبب خلاص.";

  const bits = [`اتفحص ${r.checked}`];
  if (r.filled > 0) bits.push(`اتحط سبب على ${r.filled}`);
  if (r.noReason > 0) bits.push(`${r.noReason} بوسطة نفسها ماسجّلتش سبب عليهم`);
  if (r.notFound > 0) bits.push(`${r.notFound} مالقيناهمش عند بوسطة`);

  return bits.join(" · ");
}

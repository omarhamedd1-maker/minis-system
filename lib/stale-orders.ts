// ==========================================================================
// أوردر قاعد من غير حركة
// --------------------------------------------------------------------------
// الأوردر اللي العميل أكّده وماخدش بوليصة **مافيش حاجة بتنبّه عليه**: مش
// جديد عشان يبان في «محتاج تأكيد»، ومش عند بوسطة عشان المزامنة تشوفه. فبيقعد.
//
// وده حصل فعلًا: أوردر مؤكد من ٢٢ يوليو ٢٠٢٦ فضل **٢٧ يوم** من غير بوليصة،
// ومحدش عرف غير لما لوحة اليوم اتعملت (١٩ أغسطس).
//
// ⚠️ **العدّ من `order_date` مش من وقت التأكيد** — مافيش عمود بيسجّل وقت
// تغيير الحالة في `orders`. يعني الرقم بيقول «الأوردر عمره كام يوم»، وده
// أكبر من «قاعد من كام يوم» لو التأكيد اتأخّر. الفرق مايهمش هنا: أوردر
// عمره أسبوع ولسه ماخدش بوليصة محتاج نظرة في الحالتين.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

/** الحالات اللي معناها «إحنا قلنا تمام ولسه ماشحنّاش» */
const WAITING_ON_US = ["confirmed", "packed"];

/**
 * ⚠️ **بعد كام يوم يبقى قاعد.**
 *
 * يومين طبيعي (تجهيز وتغليف). التلاتة بيحصلوا في الزحمة. **الأربعة معناها
 * إن حد نسيه** — والرقم مختار على الناحية الآمنة عشان التنبيه ما يبقاش
 * ضوضاء يومية.
 */
export const STALE_AFTER_DAYS = 4;

export type StaleOrder = {
  id: string;
  orderNumber: string | null;
  orderStatus: string | null;
  orderDate: string | null;
  bostaTracking?: string | null;
};

export type StaleRow = {
  id: string;
  orderNumber: string | null;
  /** قاعد من كام يوم */
  days: number;
};

/**
 * الأوردرات المؤكدة اللي ماخدتش بوليصة وعدّى عليها المدة.
 *
 * بيرجّع **الأقدم الأول** — ده اللي بيوجع أكتر.
 */
export function staleBeforeShipping(
  orders: StaleOrder[],
  now: Date,
  afterDays: number = STALE_AFTER_DAYS
): StaleRow[] {
  const out: StaleRow[] = [];

  for (const o of orders) {
    if (!WAITING_ON_US.includes(String(o.orderStatus))) continue;
    // معاه رقم تتبع؟ يبقى راح لبوسطة والمزامنة بقت مسؤولة عنه
    if (String(o.bostaTracking ?? "").trim()) continue;
    if (!o.orderDate) continue;

    const t = new Date(o.orderDate).getTime();
    if (Number.isNaN(t)) continue;

    const days = Math.floor((now.getTime() - t) / 86_400_000);
    // التاريخ في المستقبل بيطلّع رقم سالب — مش قاعد، ده غلط في التاريخ
    if (days < afterDays) continue;

    out.push({ id: o.id, orderNumber: o.orderNumber, days });
  }

  return out.sort((a, b) => b.days - a.days);
}

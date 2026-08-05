// ==========================================================================
// الإشعار اللي حد بيكتبه بإيده ويبعته للتيم
// --------------------------------------------------------------------------
// كل إشعارات السيستم التانية بتتولّد من حدث (أوردر رجع، شحنة وقفت). ده
// الوحيد اللي بني آدم بيكتب نصه، فمحتاج حاجتين مالهمش لازمة هناك:
//
//   ١. **حد للطول.** الإشعار المولّد شكله ثابت ومقاسه معروف، أما اللي
//      بيتكتب بإيد فممكن يبقى فقرة. والآيفون بيعرض **٤ سطور بس** —
//      اللي بعدهم بيتقص من غير ما اللي كتبه يعرف.
//
//   ٢. **اسم اللي باعت.** الإشعار المولّد جايّ من السيستم، وده جايّ من
//      زميل — و«مين قال كده» جزء من الرسالة مش تفصيلة.
//
// دوال صافية بالكامل: بتاخد نص وبترجّع نص.
// ==========================================================================

/** الآيفون بيعرض ٤ سطور وبيقص الباقي — نفس الحد المتفق عليه في باقي الإشعارات */
export const ANNOUNCE_MAX_LINES = 4;

/** حد الطول — السطر الطويل بيتلف على أكتر من سطر على الشاشة */
export const ANNOUNCE_MAX_TITLE = 60;
export const ANNOUNCE_MAX_DETAILS = 200;

export type Announcement = {
  title: string;
  details: string;
  /** اسم اللي بيبعت — بيتحط في الإشعار عشان اللي بيستلم يعرف مين */
  sender: string;
};

/**
 * بيبني نص الإشعار بنفس شكل باقي إشعارات السيستم:
 * العنوان في السطر الأول (ده اللي بيبان عريض)، وتحته مين باعت، وبعدين الكلام.
 *
 * ⚠️ **الإيموجي في آخر السطر مش أوله** — نفس السبب المكتوب في
 * `lib/alert-messages.ts`: التليفون بيحدد اتجاه السطر من أول حرف حقيقي فيه،
 * والسطر اللي بيبدأ بإيموجي بيترمي على الشمال والباقي على اليمين.
 */
export function composeAnnouncement(a: Announcement): string {
  // **العنوان سطر واحد مهما اتكتب** — هو اللي بيبقى عنوان الإشعار، ولو
  // اتقسم سطرين الشكل بيتكسر على الآيفون
  const title = clean(a.title).replace(/\n+/g, " · ");
  const details = clean(a.details);
  const sender = clean(a.sender).replace(/\n+/g, " ");

  const lines = [`<b>${title}</b> 📣`];
  if (sender) lines.push(`من ${sender}`);
  if (details) lines.push(details);

  return lines.join("\n");
}

/** عدد السطور اللي هتتعرض فعلاً — السطر الفاضي مش سطر */
export function announceLineCount(message: string): number {
  return message.split("\n").filter((l) => l.trim()).length;
}

export type AnnounceCheck = { ok: true } | { ok: false; error: string };

/**
 * الفحص قبل الإرسال.
 *
 * **الإشعار مالوش تراجع** — طلع على تليفونات الناس خلاص، مفيش زرار يشيله.
 * فالفحص هنا أهم من أي فورم تاني في السيستم.
 */
export function checkAnnouncement(a: Announcement): AnnounceCheck {
  const title = clean(a.title);
  if (!title) return { ok: false, error: "اكتب عنوان الإشعار الأول" };
  if (title.length > ANNOUNCE_MAX_TITLE) {
    return {
      ok: false,
      error: `العنوان طويل (${title.length} حرف) — خلّيه ${ANNOUNCE_MAX_TITLE} حرف على الأكتر`,
    };
  }

  const details = clean(a.details);
  if (details.length > ANNOUNCE_MAX_DETAILS) {
    return {
      ok: false,
      error: `الكلام طويل (${details.length} حرف) — خلّيه ${ANNOUNCE_MAX_DETAILS} حرف على الأكتر`,
    };
  }

  return { ok: true };
}

/**
 * تحذير مش منع: الإشعار هيتقص على الآيفون.
 * بنقولها ومابنمنعش — أحيانًا آخر سطر مش مهم واللي كاتب عارف.
 */
export function announceWarning(message: string): string | null {
  const lines = announceLineCount(message);
  if (lines <= ANNOUNCE_MAX_LINES) return null;
  return `الإشعار ${lines} سطور — الآيفون بيعرض ${ANNOUNCE_MAX_LINES} والباقي بيتقص`;
}

/**
 * بيلمّ المسافات والسطور الفاضية.
 * السطر الفاضي بياخد من الأربعة اللي الآيفون بيعرضهم من غير ما يقول حاجة،
 * واللي بيكتب بيسيبه من غير قصد — فبنشيله.
 */
function clean(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

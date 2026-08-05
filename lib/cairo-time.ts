// ==========================================================================
// وقت القاهرة ↔ التوقيت العالمي
// --------------------------------------------------------------------------
// المستخدم بيكتب «١٠ أغسطس ٢:٣٠» وهو قاصد بتوقيت مصر، وقاعدة البيانات
// بتخزّن `timestamptz` بالتوقيت العالمي. الترجمة بينهم لازم تحصل في مكان
// واحد، وإلا كل شاشة هتخمّن.
//
// ⚠️ **ومصر عندها توقيت صيفي من ٢٠٢٣**: +٢ شتاءً و+٣ صيفًا. يعني الفرق
// **مش ثابت** — تنبيه اتحفظ في يوليو بفرق ثابت ٢ كان هيرن بعد ساعة من
// معاده. فبنسأل المتصفح عن الفرق **في التاريخ ده بالذات** بدل ما نكتب رقم.
//
// دوال صافية بالكامل.
// ==========================================================================

const CAIRO = "Africa/Cairo";

/**
 * فرق القاهرة عن التوقيت العالمي بالدقايق في اللحظة دي.
 *
 * الحيلة: بنطلب من `Intl` يكتب اللحظة دي بتوقيت القاهرة، وبعدين نقراها
 * كأنها عالمية — الفرق بين الاتنين هو الإزاحة. مفيش مكتبة ولا جدول
 * توقيتات محفوظ، والمتصفح بيحدّث بياناته لوحده.
 */
export function cairoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  // `hour12: false` بيطلّع ٢٤ بدل ٠ في نص الليل عند بعض المتصفحات
  const hour = get("hour") % 24;

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );

  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * «2026-08-10T14:30» (اللي خانة الوقت في المتصفح بتديها) ← وقت عالمي.
 *
 * بنحسب الإزاحة على الوقت نفسه الأول كأنه عالمي، وده تقريب كافي: الفرق
 * بين +٢ و+٣ مابيغيّرش الإجابة إلا في الساعة اللي الساعة بتتغيّر فيها
 * (مرتين في السنة)، وساعتها التنبيه بيروح بفرق ساعة — مش خسارة.
 */
export function cairoInputToUtc(local: string): string | null {
  const s = String(local ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;

  const naive = Date.parse(s.slice(0, 16) + ":00Z");
  if (!Number.isFinite(naive)) return null;

  const offset = cairoOffsetMinutes(new Date(naive));
  return new Date(naive - offset * 60_000).toISOString();
}

/** العكس — عشان الخانة تفتح على القيمة المحفوظة */
export function utcToCairoInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";

  const shifted = new Date(at.getTime() + cairoOffsetMinutes(at) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** «١٠ أغسطس ٢:٣٠ م» — للعرض */
export function cairoTimeText(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    timeZone: CAIRO,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

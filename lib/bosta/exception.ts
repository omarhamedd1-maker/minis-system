// ==========================================================================
// سبب وقوف الشحنة عند بوسطة — بالعربي وبتفاصيله
// --------------------------------------------------------------------------
// بوسطة بتحط تفاصيل المحاولات في `state.exception[]` — مصفوفة كل عنصر فيها
// محاولة: السبب، وامتى، وهل اتجدولت لتاريخ تاني. وإحنا كنا بنقرا خانات تانية
// فاضية (`latestExceptionReason`) فالسبب مكان يوصلنا خالص.
//
// اللي حصل في أوردر ١٣٦٤: محاولتين — العميل أجّل، وبعدين رفض يستلم. وبوسطة
// حاطة `waitingForBusinessAction: true` يعني رفعت إيدها ومستنياك. وإحنا
// عندنا كان مكتوب "استلمه بوسطة" من ٩ أيام.
//
// دوال صافية بالكامل.
// ==========================================================================

export type BostaAttempt = {
  reason?: string | null;
  code?: number | null;
  time?: string | null;
  /** اتجدولت لتاريخ تاني؟ */
  scheduledAt?: string | null;
};

export type BostaExceptionState = {
  exception?: BostaAttempt[] | null;
  lastExceptionCode?: number | null;
  waitingForBusinessAction?: boolean | null;
};

/**
 * ترجمة أسباب بوسطة للعربي.
 * النصوص دي جاية من بوسطة بالإنجليزي، وبنطابق بالكلمة المفتاحية عشان لو
 * غيّروا الصيغة شوية نفضل نفهمها.
 */
const REASONS: [RegExp, string][] = [
  [/refuses? to receive/i, "العميل رفض يستلم"],
  [/postpon/i, "العميل طلب التأجيل"],
  [/not answer|no answer|doesn'?t answer/i, "العميل مش بيرد"],
  [/wrong (phone|number)/i, "رقم التليفون غلط"],
  [/wrong address|address is wrong|incorrect address/i, "العنوان غلط"],
  [/out of (delivery )?(zone|coverage)/i, "العنوان بره نطاق التغطية"],
  [/not available|unavailable/i, "العميل مش موجود"],
  [/cancel/i, "اتلغت"],
  [/damaged/i, "الشحنة اتلفت"],
  [/lost/i, "الشحنة ضاعت"],
  [/no cash|cash not available|money/i, "العميل مش معاه فلوس"],
];

export function reasonInArabic(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  for (const [re, ar] of REASONS) if (re.test(s)) return ar;
  // مش عارفينه؟ نرجّعه زي ما هو — أحسن من إننا نخفيه
  return s;
}

/** تاريخ قصير بتوقيت مصر */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "long",
  });
}

export type ExceptionSummary = {
  /** نص جاهز يتعرض في الأوردر */
  text: string;
  /** عدد المحاولات اللي فشلت */
  attempts: number;
  /** بوسطة مستنية قرار مننا؟ */
  waiting: boolean;
};

/**
 * بيلخّص المحاولات في سطر واحد مفهوم.
 * بنبدأ بآخر محاولة لأنها الأهم، وبنقول عدد المحاولات لأن بوسطة بتوقف بعد
 * محاولتين وساعتها لازم قرار.
 */
export function summarizeException(
  state: BostaExceptionState | null | undefined
): ExceptionSummary | null {
  const list = (state?.exception ?? []).filter(Boolean);
  if (list.length === 0) {
    // مافيش تفاصيل بس بوسطة مستنية؟ لازم نقولها برضه
    if (state?.waitingForBusinessAction) {
      return { text: "بوسطة واقفة ومستنية قرار منك", attempts: 0, waiting: true };
    }
    return null;
  }

  // الأحدث الأول
  const sorted = [...list].sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  const last = sorted[0];
  const reason = reasonInArabic(last.reason) ?? "بوسطة واقفة";
  const when = shortDate(last.time);

  const parts = [reason];
  if (when) parts.push(`(${when})`);

  const attempts = sorted.filter((a) => a.reason).length;
  if (attempts > 1) parts.push(`— ${attempts} محاولات`);

  // اتجدولت لتاريخ جديد؟ ده مهم عشان تعرف تستنى ولا تتحرك
  const next = shortDate(last.scheduledAt);
  if (next) parts.push(`— اتجدولت ${next}`);

  return {
    text: parts.join(" "),
    attempts,
    waiting: Boolean(state?.waitingForBusinessAction),
  };
}

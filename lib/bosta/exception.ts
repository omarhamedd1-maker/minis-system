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

// ==========================================================================
// نعمل إيه بقى؟ — النصيحة بتتكتب على حسب سبب الوقوف الحقيقي
// --------------------------------------------------------------------------
// قبل كده كان أي أوردر واقف بيقول نفس الكلام ويعرض نفس الأزرار، فيهم
// «عدّل العنوان» — والعميل اللي مش بيرد عنوانه مظبوط، وتعديله مالوش لازمة
// وبيوهم إن ده الحل.
//
// دالة صافية عشان تتختبر: نص السبب داخل، والجملة والأزرار خارجة.
// ==========================================================================

/** زرار واحد بمعنى واحد — الصفحة هي اللي بترسمه */
export type ExceptionAction = "whatsapp" | "address" | "phone" | "cancel";

export type ExceptionAdvice = {
  /** المشكلة نفسها في كلمتين */
  title: string;
  /** تعمل إيه دلوقتي */
  hint: string;
  /** الأزرار اللي ليها معنى في الحالة دي بس */
  actions: ExceptionAction[];
};

const DEFAULT_ADVICE: ExceptionAdvice = {
  title: "بوسطة واقفة ومستنية قرار منك",
  hint: "بوسطة خلّصت محاولاتها ورفعت إيدها. كلّم العميل واطلب محاولة تانية، أو قول لبوسطة ترجّع الشحنة.",
  actions: ["whatsapp", "cancel"],
};

// الترتيب مهم: الأخص الأول. "العنوان بره التغطية" فيها كلمة "العنوان"،
// فلو اتفحصت بعد "العنوان غلط" هتقول له يعدّل عنوان وهو مش دي المشكلة.
const ADVICE: [RegExp, ExceptionAdvice][] = [
  [
    /بره نطاق|بره التغطية|خارج التغطية/,
    {
      title: "العنوان بره تغطية بوسطة",
      hint: "بوسطة مابتوصّلش للمكان ده. اتفق مع العميل على عنوان تاني جوّه التغطية، أو ألغِ الأوردر.",
      actions: ["whatsapp", "address", "cancel"],
    },
  ],
  [
    /العنوان غلط|عنوان ناقص|عنوان مش/,
    {
      title: "العنوان غلط",
      hint: "صحّح عنوان العميل، وبعدين قول لبوسطة تحاول تاني.",
      actions: ["address", "whatsapp"],
    },
  ],
  [
    /رقم التليفون غلط|التليفون غلط|رقم غلط/,
    {
      title: "رقم التليفون غلط",
      hint: "المندوب مش قادر يوصل للعميل أصلاً. صحّح الرقم وبعدين قول لبوسطة تحاول تاني.",
      actions: ["phone", "cancel"],
    },
  ],
  [
    /مش بيرد|مش موجود/,
    {
      title: "العميل مش بيرد",
      hint: "كلّمه إنت واتفق على معاد يكون فيه موجود، وبعدين قول لبوسطة تحاول تاني.",
      actions: ["whatsapp", "cancel"],
    },
  ],
  [
    /رفض يستلم|رفض الاستلام/,
    {
      title: "العميل رفض يستلم",
      hint: "لو مصمم يرفض، قول لبوسطة ترجّع الشحنة وألغِ الأوردر. ولو تفتكر ينفع يتقنع، كلّمه الأول.",
      actions: ["whatsapp", "cancel"],
    },
  ],
  [
    /مش معاه فلوس|مافيش فلوس/,
    {
      title: "العميل مش معاه فلوس",
      hint: "اتفق معاه على معاد تاني يكون جهّز فيه المبلغ قبل ما بوسطة تحاول تاني.",
      actions: ["whatsapp", "cancel"],
    },
  ],
  [
    /طلب التأجيل|تأجيل/,
    {
      title: "العميل طلب التأجيل",
      hint: "لو الشحنة اتجدولت لمعاد جديد مافيش حاجة تتعمل — استنى المعاد. ولو مش متأكد كلّمه.",
      actions: ["whatsapp"],
    },
  ],
  [
    /اتلفت|ضاعت/,
    {
      title: "الشحنة اتلفت أو ضاعت",
      hint: "كلّم بوسطة على التعويض، وقرر الأوردر يترجع للمخزون ولا يتعمل تاني.",
      actions: ["whatsapp", "cancel"],
    },
  ],
  [
    /اتلغت|ملغية/,
    {
      title: "الشحنة اتلغت عند بوسطة",
      hint: "الشحنة دي مش هتتحرك تاني. اعمل شحنة جديدة للأوردر، أو ألغِ الأوردر.",
      actions: ["cancel"],
    },
  ],
];

/**
 * الجملة والأزرار المناسبة لسبب الوقوف.
 * السبب اللي مش عارفينه بياخد النصيحة العامة — أحسن من إننا نخمّن ونوجّهه غلط.
 */
export function exceptionAdvice(
  reason: string | null | undefined
): ExceptionAdvice {
  const s = String(reason ?? "").trim();
  if (!s) return DEFAULT_ADVICE;
  for (const [re, advice] of ADVICE) if (re.test(s)) return advice;
  return DEFAULT_ADVICE;
}

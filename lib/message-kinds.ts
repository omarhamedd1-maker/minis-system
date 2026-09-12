// ==========================================================================
// رسايل العميل — أربع مواقف، صوت واحد
// --------------------------------------------------------------------------
// السيستم بيفتح واتساب العميل من أربع شاشات مختلفة، وكل واحدة كانت
// بتتصرّف لوحدها:
//
// - **قايمة الأوردرات وصفحة الأوردر**: واتساب كان بيفتح **فاضي تمامًا** —
//   صاحب المتجر بيكتب من أول السطر كل مرة.
// - **الأوردر المشبوه** و**الشحنة الواقفة**: النص كان **مكتوب في الكود**،
//   فمحدش يقدر يغيّر كلمة فيه.
// - **السؤال بعد التسليم**: ده الوحيد اللي كان ليه قالب بيتظبط.
//
// ⚠️⚠️ **والكلام ده بيروح لعملاءه هو بصوته هو** — ففي منتج بيتباع لمتاجر
// تانية، النص المكتوب في الكود معناه إن كل المتاجر بتتكلم بصوتي أنا.
//
// ⚠️ **القالب بيتعدّل في الشاشة اللي بيتبعت منها** (قرار عمر) — مش في صفحة
// إعدادات بعيدة عن مكان الاستخدام.
//
// **الملف ده صافي** — الدالة الوحيدة اللي بتلمس الداتابيز في آخره ومعزولة.
// ==========================================================================

import { DEFAULT_FOLLOWUP_TEMPLATE } from "./message-template";

export type MessageKind = "confirm" | "rescue" | "followup" | "general";

export type MessageKindInfo = {
  key: MessageKind;
  /** الاسم اللي بيتعرض فوق صندوق التعديل */
  label: string;
  /** الجملة اللي بتقول القالب ده بيروح إمتى */
  when: string;
  /** النص اللي بيتبعت لو صاحب المتجر ماكتبش حاجة */
  fallback: string;
};

/**
 * القوالب الافتراضية.
 *
 * ⚠️ **قصيرة وبتسأل سؤال واحد.** الرسالة الطويلة بتتقري كإعلان وبتتقفل،
 * والهدف في كل المواقف دي إن العميل **يرد**.
 *
 * ⚠️⚠️ **وممنوع تحط خانة جوّه جملة بتتكسر من غيرها.** الخانة الفاضية
 * بتتشال هي والمسافة اللي وراها (`renderTemplate`)، فجملة زي «المطلوب
 * {المبلغ} تمام؟» بتوصل للعميل «المطلوب تمام؟» لو المبلغ مش معروف.
 */
export const MESSAGE_KINDS: MessageKindInfo[] = [
  {
    key: "confirm",
    label: "تأكيد الأوردر قبل الشحن",
    when: "قبل ما تشحن أوردر محتاج تأكيد",
    fallback: `أهلًا {الاسم} 👋
بنأكّد أوردرك رقم {رقم الأوردر} قبل ما نشحنه — العنوان والمواعيد تمام؟`,
  },
  {
    key: "rescue",
    label: "الشحنة واقفة مع المندوب",
    when: "لما بوسطة ترجّع سبب يوقف التوصيل",
    fallback: `أهلًا {الاسم} 👋
شحنتك مع المندوب ومقدرناش نوصّلها. إمتى يناسبك نبعتها تاني؟`,
  },
  {
    key: "followup",
    label: "السؤال بعد التسليم",
    when: "بعد ما العميل يستلم بكام يوم",
    fallback: DEFAULT_FOLLOWUP_TEMPLATE,
  },
  {
    key: "general",
    label: "كلام عام مع العميل",
    when: "زرار واتساب في قايمة الأوردرات وصفحة الأوردر",
    fallback: `أهلًا {الاسم} 👋
بخصوص أوردرك رقم {رقم الأوردر}`,
  },
];

export function kindInfo(kind: string): MessageKindInfo | null {
  return MESSAGE_KINDS.find((k) => k.key === kind) ?? null;
}

export type StoredTemplates = {
  /** العمود الجديد — قالب لكل موقف */
  templates?: Record<string, unknown> | null;
  /**
   * العمود القديم بتاع «اسأل بعد التسليم».
   *
   * ⚠️ **لازم يفضل يتقرا** — عمر عدّله فعلًا من الشاشة، ولو تجاهلناه
   * كلامه بيرجع للافتراضي من غير ما حد يعمل حاجة.
   */
  followupTemplate?: string | null;
};

/**
 * نص القالب المستخدم لموقف معيّن.
 *
 * الترتيب: اللي متخزّن في العمود الجديد ← بعدين العمود القديم (للسؤال بعد
 * التسليم بس) ← بعدين الافتراضي.
 */
export function templateFor(kind: MessageKind, stored: StoredTemplates): string {
  const info = kindInfo(kind);
  const fallback = info?.fallback ?? "";

  const fromNew = stored.templates?.[kind];
  if (typeof fromNew === "string" && fromNew.trim()) return fromNew.trim();

  if (kind === "followup") {
    const old = String(stored.followupTemplate ?? "").trim();
    if (old) return old;
  }

  return fallback;
}

/** كل القوالب مرة واحدة — للشاشة اللي بتعرض أكتر من واحد */
export function allTemplates(stored: StoredTemplates): Record<MessageKind, string> {
  const out = {} as Record<MessageKind, string>;
  for (const k of MESSAGE_KINDS) out[k.key] = templateFor(k.key, stored);
  return out;
}

/**
 * بيدمج قالب واحد جوّه اللي متخزّن — **من غير ما يمسح الباقي**.
 *
 * ⚠️ الكتابة المباشرة على العمود كانت هتمسح قوالب المواقف التانية، لأن
 * العمود كله قيمة واحدة.
 */
export function mergeTemplate(
  current: Record<string, unknown> | null | undefined,
  kind: MessageKind,
  text: string
): Record<string, unknown> {
  return { ...(current ?? {}), [kind]: text.trim() };
}

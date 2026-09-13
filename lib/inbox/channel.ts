// ==========================================================================
// قنوات صندوق الرسايل — ودالة النافذة اللي بتقرر تقدر ترد ولا لأ
// --------------------------------------------------------------------------
// **الملف ده صافي بالكامل** — مافيش شبكة ولا قاعدة بيانات، والوقت بيتبعت
// جوّه.
// ==========================================================================

export type Channel = "whatsapp" | "instagram" | "messenger";

export const CHANNELS: { key: Channel; label: string }[] = [
  { key: "whatsapp", label: "واتساب" },
  { key: "instagram", label: "إنستجرام" },
  { key: "messenger", label: "ماسنجر" },
];

export function channelLabel(channel: string | null | undefined): string {
  return CHANNELS.find((c) => c.key === channel)?.label ?? "—";
}

export function isChannel(value: string | null | undefined): value is Channel {
  return CHANNELS.some((c) => c.key === value);
}

/**
 * ⚠️⚠️ **نافذة الرد المجاني — ٢٤ ساعة من آخر رسالة من العميل.**
 *
 * ده قانون ميتا مش قرار في السيستم: بعد ٢٤ ساعة من آخر كلمة قالها العميل،
 * الرسالة العادية **بترفض** — ولازم قالب معتمد مسبقًا وبفلوس.
 *
 * ⚠️ **والعدّ من آخر رسالة جاية منه، مش من آخر حركة في المحادثة.** ردودنا
 * إحنا مابتفتحش النافذة تاني — ولو حسبناها من آخر حركة، السيستم هيقول
 * «مفتوحة» وهو بيرد على نفسه والرسالة هتترفض عند ميتا.
 */
export const REPLY_WINDOW_HOURS = 24;

export type WindowState = {
  open: boolean;
  /** فاضل كام ساعة — صفر لو قفلت */
  hoursLeft: number;
  /** الجملة اللي بتتعرض فوق صندوق الرد */
  note: string | null;
};

export function replyWindow(
  lastInboundAt: string | null | undefined,
  now: Date
): WindowState {
  const t = lastInboundAt ? new Date(lastInboundAt).getTime() : NaN;
  if (!Number.isFinite(t)) {
    return {
      open: false,
      hoursLeft: 0,
      // العميل عمره ما كلّمنا — فمافيش نافذة أصلاً
      note: "العميل ده لسه مابعتش حاجة، فمينفعش نبدأ الكلام من عندنا",
    };
  }

  const passed = (now.getTime() - t) / 3_600_000;
  const left = REPLY_WINDOW_HOURS - passed;

  if (left <= 0) {
    return {
      open: false,
      hoursLeft: 0,
      note: "عدّى أكتر من ٢٤ ساعة على آخر رسالة منه — الرد العادي مابيعديش",
    };
  }

  const hoursLeft = Math.max(0, Math.round(left * 10) / 10);

  // ⚠️ التنبيه بيبان في آخر ساعتين بس — الجملة الدايمة بتتقري كديكور
  return {
    open: true,
    hoursLeft,
    note:
      hoursLeft <= 2
        ? `فاضل أقل من ساعتين على قفل الرد على المحادثة دي`
        : null,
  };
}

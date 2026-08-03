// ==========================================================================
// الشحنة الواقفة — المندوب مجاش ياخدها
// --------------------------------------------------------------------------
// دالة صافية بالكامل. القصة: شحنة اتعملت، المندوب مجاش، قعدت أسبوعين،
// وبوسطة أرشفتها. ووقتها خلاص — مفيش حاجة بترجّع شحنة مؤرشفة.
//
// فالتنبيه بيتدرّج: ٣ أيام (بدري وتقدر تتحرك) ← ٧ ← ١٠ ← ١٣ (آخر فرصة،
// بوسطة بتأرشف حوالين ١٤). كل مرحلة بتنبّه **مرة واحدة** بس — المزامنة
// بتشتغل كل ١٥ دقيقة، فمن غير الشرط ده كانت هتزنّ ٩٦ مرة في اليوم.
// ==========================================================================

import { alertHead } from "../alert-messages";

/** مراحل التنبيه بالأيام. الأخيرة قبل الأرشفة بيوم */
export const STALE_MILESTONES = [3, 7, 10, 13] as const;

/** بوسطة بتأرشف الشحنة اللي مااتاخدتش حوالين اليوم ده */
export const BOSTA_ARCHIVES_AFTER_DAYS = 14;

/**
 * الحالات اللي معناها "الشحنة اتعملت بس لسه في إيدنا".
 * أول ما المندوب يستلم بجد (`shipped` وما بعدها) خلاص خرجت من مسؤوليتنا.
 */
const WAITING_STATUSES = ["ready", "new", "confirmed", "packed"];

export type StaleCheck = {
  /** قاعدة كام يوم */
  days: number;
  /** المرحلة اللي المفروض ننبّه عليها دلوقتي، أو null لو مفيش */
  milestone: number | null;
  /** ليه مانبعتش — للتشخيص */
  skip?: "not_waiting" | "no_date" | "too_soon" | "already_alerted";
};

export function checkStalePickup(input: {
  /** امتى الشحنة اتعملت عند بوسطة */
  createdAt: string | null | undefined;
  /** حالة الأوردر عندنا */
  orderStatus: string | null | undefined;
  /** آخر مرحلة نبّهنا عليها (٠ أو null = مفيش) */
  alertedDay: number | null | undefined;
  now: Date;
}): StaleCheck {
  const { createdAt, orderStatus, alertedDay, now } = input;

  if (!createdAt) return { days: 0, milestone: null, skip: "no_date" };

  const days = Math.floor(
    (now.getTime() - new Date(createdAt).getTime()) / 86_400_000
  );

  // المندوب استلمها خلاص؟ مالناش دعوة
  if (!WAITING_STATUSES.includes(String(orderStatus ?? ""))) {
    return { days, milestone: null, skip: "not_waiting" };
  }

  // أعلى مرحلة عدّاها عمر الشحنة
  const reached = [...STALE_MILESTONES]
    .reverse()
    .find((m) => days >= m);

  if (reached === undefined) {
    return { days, milestone: null, skip: "too_soon" };
  }
  if (reached <= Number(alertedDay ?? 0)) {
    return { days, milestone: null, skip: "already_alerted" };
  }

  return { days, milestone: reached };
}

/**
 * رسالة التنبيه — بتتغيّر لهجتها حسب المرحلة.
 * آخر مرحلة لازم تبقى صريحة إن ده آخر يوم للتحرك.
 */
export function stalePickupMessage(a: {
  orderNumber: string | number | null;
  customerName: string | null;
  days: number;
  milestone: number;
  siteUrl?: string | null;
}): string {
  const last = a.milestone === STALE_MILESTONES[STALE_MILESTONES.length - 1];
  const left = BOSTA_ARCHIVES_AFTER_DAYS - a.days;

  const lines = alertHead(
    last ? "🚨" : "🕗",
    last
      ? `آخر فرصة — شحنة أوردر ${a.orderNumber ?? "—"}`
      : `شحنة أوردر ${a.orderNumber ?? "—"} واقفة`,
    a.customerName
  );
  lines.push(`قاعدة: <b>${a.days} يوم</b> من غير بيك اب`);
  lines.push("");

  if (last) {
    lines.push(
      left > 0
        ? `فاضل ${left} يوم وبوسطة تأرشفها وخلاص مفيش رجعة. كلّمهم دلوقتي أو اعمل شحنة جديدة.`
        : "بوسطة بتأرشف الشحنة في حدود اليوم ده. كلّمهم دلوقتي أو اعمل شحنة جديدة."
    );
  } else {
    lines.push("كلّم بوسطة واطلب المندوب.");
  }

  if (a.siteUrl) lines.push(`${a.siteUrl}/orders?status=ready`);
  return lines.join("\n");
}

// ==========================================================================
// صحة الوصلات — شوبيفاي وبوسطة شغّالين؟
// --------------------------------------------------------------------------
// لما الربط يقع دلوقتي **مافيش حاجة بتقول**. الأوردرات بتقف، والشحنات
// مابتتحدّثش، وصاحب المتجر فاكر إن البيع بايت — والحقيقة إن الوصلة مقطوعة.
//
// ⚠️⚠️ **«مافيش أوردرات» و«الوصلة مقطوعة» شكلهم واحد من برّه.** الفرق
// الوحيد اللي بيفرّق بينهم هو **إن حد يسأل الطرف التاني ويشوف رده** — مش
// عدد الأوردرات. عشان كده الشاشة دي بتسأل فعلاً، مابتخمّنش.
//
// ⚠️ **و«مش مربوط» حالة تالتة غير «مربوط وواقع»** — لو خلطناهم، العميل
// الجديد اللي لسه مافتحش حسابه هيشوف إنذار أحمر من أول يوم من غير سبب.
//
// **الملف ده صافي** — بياخد نتايج الاختبارات وبيرجّع حالة. الاختبارات
// نفسها بتحصل في الشاشة.
// ==========================================================================

/** تمام · فيه تأخير · واقعة · مش مربوطة */
export type LinkState = "ok" | "warn" | "down" | "off";

export type Check = {
  /** اسم الحاجة اللي اتفحصت */
  label: string;
  state: LinkState;
  /** جملة واحدة بتقول اللي حصل */
  detail: string;
};

export type LinkCard = {
  key: "shopify" | "bosta";
  label: string;
  state: LinkState;
  checks: Check[];
};

/** المزامنة كل ربع ساعة — الساعة معناها ٤ لفات ضاعت */
export const STALE_MINUTES = 60;
/** ٣ ساعات من غير مزامنة ناجحة = واقعة، مش بطيئة */
export const DOWN_MINUTES = 180;
/** أوردر جديد كل كام يوم على الأقل — أقل من كده يبقى الأمر مريب */
export const QUIET_DAYS = 3;

export type ProbeResult = { ok: boolean; error?: string };

export type HealthFacts = {
  shopify: {
    /** فيه بيانات دخول متسجّلة؟ */
    linked: boolean;
    /** نتيجة سؤال شوبيفاي دلوقتي — و`null` لو مااتسألش */
    probe: ProbeResult | null;
    /** كام ويبهوك متسجّل عندهم */
    webhooks: number | null;
    /** آخر أوردر دخل عندنا */
    lastOrderAt: string | null;
  };
  bosta: {
    linked: boolean;
    probe: ProbeResult | null;
    /** آخر مزامنة ناجحة */
    lastSyncAt: string | null;
    /** آخر مزامنة رجّعت أخطاء؟ */
    lastSyncFailed: boolean;
  };
};

function minutesSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 60_000));
}

/** «دلوقتي» · «من ٤٠ دقيقة» · «من ٣ ساعات» · «من يومين» */
export function agoText(minutes: number | null): string {
  if (minutes === null) return "ولا مرة";
  if (minutes < 2) return "دلوقتي";
  if (minutes < 60) return `من ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `من ${hours} ساعة`;
  return `من ${Math.floor(hours / 24)} يوم`;
}

/** أسوأ حالة في المجموعة هي حالة الكارت كله */
function worst(checks: Check[]): LinkState {
  const order: LinkState[] = ["off", "down", "warn", "ok"];
  for (const s of order) if (checks.some((c) => c.state === s)) return s;
  return "ok";
}

export function integrationHealth(facts: HealthFacts, now: Date): LinkCard[] {
  return [shopifyCard(facts.shopify, now), bostaCard(facts.bosta, now)];
}

function shopifyCard(s: HealthFacts["shopify"], now: Date): LinkCard {
  if (!s.linked) {
    return {
      key: "shopify",
      label: "شوبيفاي",
      state: "off",
      checks: [{ label: "الربط", state: "off", detail: "مش مربوط" }],
    };
  }

  const checks: Check[] = [];

  checks.push(
    s.probe === null
      ? { label: "المفتاح", state: "warn", detail: "مااتفحصش" }
      : s.probe.ok
        ? { label: "المفتاح", state: "ok", detail: "شوبيفاي ردّت" }
        : {
            label: "المفتاح",
            state: "down",
            detail: s.probe.error || "شوبيفاي مارّدتش",
          }
  );

  // ⚠️ **الويبهوكس هي اللي بتجيب الأوردر لحظة ما يتعمل.** من غيرها الأوردرات
  // بتيجي بس لما حد يضغط «هات من شوبيفاي» بإيده — يعني تأخير مش انقطاع.
  checks.push(
    s.webhooks === null
      ? { label: "الويبهوكس", state: "warn", detail: "مااتفحصتش" }
      : s.webhooks === 0
        ? {
            label: "الويبهوكس",
            state: "warn",
            detail: "مافيش — الأوردرات مش بتوصل لوحدها",
          }
        : { label: "الويبهوكس", state: "ok", detail: `${s.webhooks} متسجّلين` }
  );

  // ⚠️ **ده مؤشر أضعف بكتير** — يوم من غير أوردرات حاجة طبيعية. عشان كده
  // أقصى حاجة بيوصلها «مريب»، وعمره ما يقول «واقعة» لوحده.
  const mins = minutesSince(s.lastOrderAt, now);
  const days = mins === null ? null : Math.floor(mins / (60 * 24));
  checks.push({
    label: "آخر أوردر",
    state: days !== null && days >= QUIET_DAYS ? "warn" : "ok",
    detail: agoText(mins),
  });

  return { key: "shopify", label: "شوبيفاي", state: worst(checks), checks };
}

function bostaCard(b: HealthFacts["bosta"], now: Date): LinkCard {
  if (!b.linked) {
    return {
      key: "bosta",
      label: "بوسطة",
      state: "off",
      checks: [{ label: "الربط", state: "off", detail: "مش مربوط" }],
    };
  }

  const checks: Check[] = [];

  checks.push(
    b.probe === null
      ? { label: "المفتاح", state: "warn", detail: "مااتفحصش" }
      : b.probe.ok
        ? { label: "المفتاح", state: "ok", detail: "بوسطة ردّت" }
        : {
            label: "المفتاح",
            state: "down",
            detail: b.probe.error || "بوسطة مارّدتش",
          }
  );

  // المزامنة هي اللي بتحدّث الحالات والتحصيل — ودي بتشتغل لوحدها كل ربع ساعة،
  // فوقوفها **مش احتمال**، ده عطل أكيد.
  const mins = minutesSince(b.lastSyncAt, now);
  const late = mins === null || mins > DOWN_MINUTES;
  checks.push({
    label: "المزامنة",
    state: late ? "down" : b.lastSyncFailed || mins > STALE_MINUTES ? "warn" : "ok",
    detail:
      agoText(mins) + (b.lastSyncFailed ? " · وآخر محاولة رجّعت أخطاء" : ""),
  });

  return { key: "bosta", label: "بوسطة", state: worst(checks), checks };
}

/** فيه وصلة واقعة؟ */
export function anyDown(cards: LinkCard[]): boolean {
  return cards.some((c) => c.state === "down");
}

/** جملة الملخّص اللي فوق — بتقول الحالة بس، من غير ما تقول اعمل إيه */
export function healthLine(cards: LinkCard[]): string {
  const down = cards.filter((c) => c.state === "down");
  if (down.length > 0) return `${down.map((c) => c.label).join(" و")} مش رادّة.`;

  const warn = cards.filter((c) => c.state === "warn");
  if (warn.length > 0) return `${warn.map((c) => c.label).join(" و")} فيها ملاحظات.`;

  const on = cards.filter((c) => c.state !== "off");
  if (on.length === 0) return "مافيش وصلة مربوطة لسه.";
  return "الوصلات شغّالة.";
}

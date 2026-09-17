/**
 * ==========================================================================
 * مطابقة تحويل شركة الشحن بالأوردرات (TRANSFERS §٦ · الخطوة ٢)
 * --------------------------------------------------------------------------
 * التحويل بيقول: مبلغ التحصيل (`gross`) وعدد الأوردرات (`count`). والمطلوب
 * نعرف **أنهي أوردرات** بالظبط جوّه التحويل ده.
 *
 * ⚠️⚠️ **السماح صفر — المطابقة بالمليم.** أرقام بوسطة عشرية ودقيقة
 * (٦,٠٤٠٫٥٦)، والتقريب هو اللي عمل فرق الـ١٢٦٫٩٤ اللي ضاع يومين في تحقيقه.
 * أي سماح بيفتح باب لأخطاء بتتراكم من غير ما حد يشوفها.
 *
 * ⚠️ **اللي مالوش مطابق مايتسجّلش** — بيرجع `needs_review` **بسببه مكتوب**،
 * وعمر هو اللي بيقرر. رقم غلط في الخزنة أوحش من صف مستني.
 *
 * **الملف ده صافي** — مافيش شبكة ولا داتابيز ولا وقت.
 * ==========================================================================
 */

/** فرق أقل من نص قرش = صفر (الفاصلة العايمة بتعمل ٠٫٠٠٠٠٠٠١) */
const EPS = 0.005;
const eq = (a: number, b: number) => Math.abs(a - b) < EPS;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export type PayoutInput = {
  /** مبلغ التحصيل — مجموع اللي العملاء دفعوه */
  gross: number;
  /** عدد الأوردرات من الإيميل/الكشف — `null` لو مش معروف */
  count: number | null;
};

/** أوردر متسلّم ولسه مش مربوط بأي تحويل */
export type PayoutCandidate = {
  orderId: string;
  /** المبلغ المحصّل من العميل (`bosta_cod`) */
  cod: number;
  /** تاريخ التسليم — الترتيب بيه، الأقدم الأول */
  deliveredAt: string | null;
};

export type MatchResult =
  | { ok: true; orderIds: string[]; how: "oldest" | "search" }
  | { ok: false; reason: string; options?: string[][] };

/** بيرتّب الأقدم الأول — واللي مالوش تاريخ في الآخر */
function byOldest(a: PayoutCandidate, b: PayoutCandidate) {
  const x = a.deliveredAt ?? "9999";
  const y = b.deliveredAt ?? "9999";
  return x < y ? -1 : x > y ? 1 : a.orderId < b.orderId ? -1 : 1;
}

/**
 * كل المجموعات اللي عددها `count` ومجموعها `gross`.
 *
 * ⚠️ **بيوقف عند حد** — البحث عن كل التوافيق بينفجر أُسّيًا (٣٠ أوردر و٥
 * في المجموعة = ١٤٢ ألف احتمال). بنوقف بعد ما نلاقي احتمالين: الاتنين
 * كفاية عشان نقول «مش متأكدين» ونرجّع لعمر.
 */
function search(
  items: PayoutCandidate[],
  count: number,
  gross: number,
  limit = 2
): string[][] {
  const found: string[][] = [];
  const pick: PayoutCandidate[] = [];

  const walk = (start: number, left: number, remaining: number) => {
    if (found.length >= limit) return;
    if (left === 0) {
      if (eq(remaining, 0)) found.push(pick.map((p) => p.orderId));
      return;
    }
    for (let i = start; i <= items.length - left; i++) {
      // الباقي أصغر من أصغر مبلغ ممكن؟ مفيش فايدة من الاستمرار
      if (remaining < -EPS) return;
      pick.push(items[i]);
      walk(i + 1, left - 1, remaining - items[i].cod);
      pick.pop();
      if (found.length >= limit) return;
    }
  };

  walk(0, count, gross);
  return found;
}

/**
 * @param candidates أوردرات متسلّمة مش مربوطة بتحويل — أي ترتيب
 */
export function matchPayout(
  payout: PayoutInput,
  candidates: PayoutCandidate[]
): MatchResult {
  const gross = Number(payout.gross);
  if (!Number.isFinite(gross) || gross <= 0) {
    return { ok: false, reason: "مبلغ التحويل مش رقم صحيح" };
  }
  const usable = candidates.filter((c) => Number(c.cod) > 0);
  if (usable.length === 0) {
    return { ok: false, reason: "مفيش أوردرات متسلّمة مش مربوطة بتحويل" };
  }

  const sorted = [...usable].sort(byOldest);
  const count = payout.count;

  // ١) المحاولة الأولى: أقدم N. بوسطة بتحوّل بالترتيب، فدي بتمشي في الغالب
  if (count !== null && count > 0) {
    if (count > sorted.length) {
      return {
        ok: false,
        reason: `التحويل فيه ${count} أوردر والمتاح ${sorted.length} — فيه أوردرات مش في السيستم`,
      };
    }
    const oldest = sorted.slice(0, count);
    if (eq(sum(oldest.map((o) => o.cod)), gross)) {
      return { ok: true, orderIds: oldest.map((o) => o.orderId), how: "oldest" };
    }

    // ٢) بحث عن أي مجموعة بنفس العدد والمجموع
    const hits = search(sorted, count, gross);
    if (hits.length === 1) return { ok: true, orderIds: hits[0], how: "search" };
    if (hits.length > 1) {
      return {
        ok: false,
        reason: "فيه أكتر من مجموعة أوردرات بنفس المبلغ والعدد — اختار الصح",
        options: hits,
      };
    }
    const total = sum(sorted.map((o) => o.cod));
    return {
      ok: false,
      reason:
        gross > total + EPS
          ? `مبلغ التحويل أكبر من كل المتاح (${round(total)}) — فيه أوردرات مش في السيستم`
          : `مفيش ${count} أوردر مجموعهم ${round(gross)} بالظبط`,
    };
  }

  // العدد مش معروف (إدخال يدوي مثلًا): بنجرّب الأقدم واحد ورا التاني
  let acc = 0;
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i].cod;
    if (eq(acc, gross)) {
      return {
        ok: true,
        orderIds: sorted.slice(0, i + 1).map((o) => o.orderId),
        how: "oldest",
      };
    }
    if (acc > gross + EPS) break;
  }
  return { ok: false, reason: "مفيش مجموعة أوردرات من الأقدم مجموعها المبلغ ده" };
}

const round = (n: number) => Math.round(n * 100) / 100;

// ==========================================================================
// الربط بالحركات اليدوية القديمة (§٩.١)
// --------------------------------------------------------------------------
// ⚠️⚠️ **التحويلات القديمة متسجّلة حركات يدوية بالفعل** (مينيز ٢٤ حركة
// بـ١٢٦,٤٩٦). الاستيراد التاريخي **بيربط** بيها — ولو عمل حركة جديدة،
// الفلوس بتتعدّ مرتين.
// ==========================================================================

export type ManualCashRow = {
  id: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
};

export type CashLink =
  | { kind: "linked"; cashId: string }
  | { kind: "gap" }
  | { kind: "diff"; cashId: string; difference: number };

/**
 * التحويل ده يقابله إيه في الخزنة؟
 *
 * - **مطابق** بالمليم وفي نفس اليوم (± يوم، لأن التسجيل بالإيد بيتأخر) → يتربط.
 * - **فرق** — أقرب حركة في اليومين دول بمبلغ مختلف (٦,٤٠٠ يدوي مقابل
 *   ٦,٤٣٧٫٤٤ حقيقي) → بيتعرض الفرق ومستني قرار. **مايتصلحش لوحده.**
 * - **ناقص** — مفيش حركة خالص → مستني دوسة تعمل الحركة.
 *
 * @param used حركات اتربطت بتحويلات تانية — مابتتحسبش تاني
 */
export function linkToManualCash(
  payout: { net: number; date: string },
  rows: ManualCashRow[],
  used: Set<string> = new Set()
): CashLink {
  const free = rows.filter((r) => !used.has(r.id) && near(r.date, payout.date));
  if (free.length === 0) return { kind: "gap" };

  const exact = free.find((r) => eq(Number(r.amount), Number(payout.net)));
  if (exact) return { kind: "linked", cashId: exact.id };

  // أقرب مبلغ — الفرق بيتعرض زي ما هو
  const closest = [...free].sort(
    (a, b) =>
      Math.abs(Number(a.amount) - payout.net) - Math.abs(Number(b.amount) - payout.net)
  )[0];
  return {
    kind: "diff",
    cashId: closest.id,
    difference: round(Number(payout.net) - Number(closest.amount)),
  };
}

/** نفس اليوم أو اللي قبله أو اللي بعده */
function near(a: string, b: string): boolean {
  const x = Date.parse(a.slice(0, 10) + "T12:00:00Z");
  const y = Date.parse(b.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  return Math.abs(x - y) <= 86_400_000;
}

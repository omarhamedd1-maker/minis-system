import { describe, expect, it } from "vitest";
import { COOLDOWN_MS, PERIODIC_COOLDOWN_MS, shouldSyncNow } from "./sync-cooldown";

const now = new Date("2026-08-18T05:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("مهلة المزامنة", () => {
  it("**مافيش مزامنة قبل كده؟ نزامن**", () => {
    expect(shouldSyncNow(null, now)).toEqual({ run: true });
    expect(shouldSyncNow(undefined, now)).toEqual({ run: true });
  });

  it("عدّت المهلة؟ نزامن", () => {
    expect(shouldSyncNow(ago(COOLDOWN_MS), now)).toEqual({ run: true });
    expect(shouldSyncNow(ago(COOLDOWN_MS + 1), now)).toEqual({ run: true });
  });

  it("لسه في المهلة؟ نستنى — والباقي بيتقال", () => {
    expect(shouldSyncNow(ago(20_000), now)).toEqual({
      run: false,
      waitMs: COOLDOWN_MS - 20_000,
    });
  });

  it("**تاريخ مش مفهوم؟ نزامن** — الأمان إننا نشتغل مش إننا نسكت", () => {
    expect(shouldSyncNow("مش تاريخ", now)).toEqual({ run: true });
  });

  it("**تاريخ في المستقبل بيتعامل كأنه دلوقتي**", () => {
    // ساعة السيرفر وساعة الداتابيز بيفرقوا ثواني — والفرق بالسالب كان
    // هيعدّي المهلة ويخلّي كل رنّة تزامن
    const future = new Date(now.getTime() + 5_000).toISOString();
    expect(shouldSyncNow(future, now)).toEqual({
      run: false,
      waitMs: COOLDOWN_MS,
    });
  });

  it("بتقبل `Date` زي النص", () => {
    // ⚠️ بالثابت مش برقم مكتوب — المهلة اتغيّرت والاختبار وقع (٩ نوفمبر ٢٠٢٦)
    expect(
      shouldSyncNow(new Date(now.getTime() - COOLDOWN_MS - 1_000), now)
    ).toEqual({ run: true });
  });

  it("**رشقة رنّات بتتجمّع في مزامنة واحدة**", () => {
    // عشر رنّات في نص دقيقة: الأولى بتزامن والباقي بيستنى
    let last: string | null = null;
    let runs = 0;
    for (let i = 0; i < 10; i++) {
      const at = new Date(now.getTime() + i * 3_000);
      const d = shouldSyncNow(last, at);
      if (d.run) {
        runs++;
        last = at.toISOString();
      }
    }
    expect(runs).toBe(1);
  });
});

// ==========================================================================
// ⚠️ المهلة الدورية — فيرسل وقّف المشروع (٩ نوفمبر ٢٠٢٦)
// --------------------------------------------------------------------------
// الراوت الدوري ماكانش فيه مهلة خالص، والكرون بينده كل ١٥ دقيقة:
// ٥٬٧٦٤ لفة و٢٢.٢ ساعة في ٣٠ يوم على باقة حدها ٤ ساعات.
// ==========================================================================
describe("المهلة الدورية", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("ساعة — عشان الكرون كل ربع ساعة يعدّي تلات مرات من أربعة", () => {
    expect(PERIODIC_COOLDOWN_MS).toBe(3_600_000);
    for (const minutes of [15, 30, 45]) {
      expect(
        shouldSyncNow(ago(minutes * 60_000), now, PERIODIC_COOLDOWN_MS).run
      ).toBe(false);
    }
    expect(shouldSyncNow(ago(60 * 60_000), now, PERIODIC_COOLDOWN_MS)).toEqual({
      run: true,
    });
  });

  it("⚠️ أطول من مهلة الويب هوك — الدورية شبكة أمان مش المصدر الأساسي", () => {
    expect(PERIODIC_COOLDOWN_MS).toBeGreaterThan(COOLDOWN_MS);
  });

  it("مفيش لفة قبل كده؟ بنزامن — المهلة مش عذر للسكوت", () => {
    expect(shouldSyncNow(null, now, PERIODIC_COOLDOWN_MS)).toEqual({ run: true });
  });
});

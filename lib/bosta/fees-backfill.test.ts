import { describe, expect, it } from "vitest";
import { RETRY_AFTER_DAYS, retryCutoff } from "./fees-backfill";

describe("طابور جلب الرسوم: الشحنة الميتة بتخرج منه", () => {
  const NOW = new Date("2026-08-06T12:00:00.000Z");

  // **الباج اللي ده بيصلّحه**: ١٧ شحنة عمرها ما هيبقى ليها كشف عند بوسطة
  // كانت بتتنده كل ١٥ دقيقة وترجع فاضية — ١٬٦٠٠ نداء ضايع في اليوم، وكمان
  // بتاخد مكان في الدفعة من اللي لسه ليه أمل.
  it("الحد بيرجع ٣ أيام لورا", () => {
    expect(retryCutoff(NOW)).toBe("2026-08-03T12:00:00.000Z");
    expect(RETRY_AFTER_DAYS).toBe(3);
  });

  it("المحاولة النهاردة مش هتترجع بكرة", () => {
    const cutoff = retryCutoff(NOW);
    const triedToday = "2026-08-06T11:00:00.000Z";
    expect(triedToday > cutoff).toBe(true); // يعني بره الطابور
  });

  it("المحاولة اللي بقى لها ٤ أيام بترجع للطابور", () => {
    const cutoff = retryCutoff(NOW);
    const triedLongAgo = "2026-08-02T12:00:00.000Z";
    expect(triedLongAgo < cutoff).toBe(true);
  });

  it("عدد الأيام ينفع يتغيّر للاختبار", () => {
    expect(retryCutoff(NOW, 1)).toBe("2026-08-05T12:00:00.000Z");
  });
});

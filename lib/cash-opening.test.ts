import { describe, expect, it } from "vitest";
import { checkOpening, latestOpeningDate } from "./cash-opening";

describe("الرصيد الافتتاحي", () => {
  it("قبل أول حركة بيوم على الأقل", () => {
    expect(latestOpeningDate("2026-07-19T00:00:00+00:00")).toBe("2026-07-18");
    expect(latestOpeningDate(null)).toBeNull();
  });

  it("⚠️ في يوم أول حركة أو بعده = مرفوض — الرصيد الجاري هيتحسب بترتيب غلط", () => {
    const r = checkOpening({ amount: "23250", date: "2026-07-19", firstMoveDate: "2026-07-19" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("2026-07-19");
  });

  it("مينيز: ٢٣,٢٥٠ يوم ١٨ يوليو وأول حركة ١٩", () => {
    expect(checkOpening({ amount: "23250", date: "2026-07-18", firstMoveDate: "2026-07-19" })).toEqual({
      ok: true,
      amount: 23250,
      date: "2026-07-18",
    });
  });

  it("مفيش حركات = أي تاريخ", () => {
    expect(checkOpening({ amount: "0", date: "2026-09-17", firstMoveDate: null }).ok).toBe(true);
  });

  it("المبلغ: صفر أو أكتر · فاضي أو سالب مرفوض", () => {
    for (const amount of ["", "-5", "abc", null]) {
      expect(checkOpening({ amount, date: "2026-01-01", firstMoveDate: null }).ok, String(amount)).toBe(false);
    }
    expect(checkOpening({ amount: "10.555", date: "2026-01-01", firstMoveDate: null })).toMatchObject({ amount: 10.56 });
  });

  it("التاريخ لازم يبقى تاريخ", () => {
    expect(checkOpening({ amount: "1", date: "", firstMoveDate: null }).ok).toBe(false);
    expect(checkOpening({ amount: "1", date: "امبارح", firstMoveDate: null }).ok).toBe(false);
  });
});

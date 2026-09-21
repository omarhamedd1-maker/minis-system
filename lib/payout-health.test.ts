import { describe, expect, it } from "vitest";
import {
  CANCELLED_REASON,
  MISSING_REASON,
  stalePayouts,
} from "./payout-health";

const p = (id: string, status: string, cash: string | null) => ({
  id,
  status,
  cashTransactionId: cash,
});

describe("التحويل المتأكّد اللي حركته اتلغت", () => {
  it("⚠️ المتأكّد على حركة ملغية بيرجع مراجعة وسببه مكتوب", () => {
    const out = stalePayouts([p("a", "confirmed", "c1")], new Set(["c1"]));
    expect(out).toEqual([{ id: "a", reason: CANCELLED_REASON }]);
  });

  it("والمتطابق زيه — الاتنين معناهم «مافيش شغل هنا»", () => {
    const out = stalePayouts([p("a", "matched", "c1")], new Set(["c1"]));
    expect(out).toHaveLength(1);
  });

  it("الحركة الحيّة مابتتلمسش", () => {
    expect(stalePayouts([p("a", "confirmed", "c1")], new Set(["c9"]))).toEqual([]);
  });

  it("اللي محتاج مراجعة أصلًا مابيتكررش — هو ظاهر خلاص", () => {
    const out = stalePayouts([p("a", "needs_review", "c1")], new Set(["c1"]));
    expect(out).toEqual([]);
  });

  it("المش مربوط بحركة برّه الفحص", () => {
    expect(stalePayouts([p("a", "confirmed", null)], new Set(["c1"]))).toEqual([]);
  });

  it("الحركة المش موجودة ليها سبب تاني — الفرق بيوصل للي بيقرا", () => {
    const out = stalePayouts(
      [p("a", "confirmed", "c1")],
      new Set(),
      new Set(["c1"])
    );
    expect(out).toEqual([{ id: "a", reason: MISSING_REASON }]);
  });

  it("⚠️ المش موجودة تغلب الملغية — «مش موجودة» أدق", () => {
    const out = stalePayouts(
      [p("a", "confirmed", "c1")],
      new Set(["c1"]),
      new Set(["c1"])
    );
    expect(out).toEqual([{ id: "a", reason: MISSING_REASON }]);
  });

  it("بيرجّع اللي محتاج تصليح بس من قايمة مخلوطة", () => {
    const out = stalePayouts(
      [
        p("a", "confirmed", "c1"),
        p("b", "confirmed", "c2"),
        p("c", "needs_review", "c1"),
        p("d", "matched", null),
      ],
      new Set(["c1"])
    );
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});

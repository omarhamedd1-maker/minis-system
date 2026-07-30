import { describe, expect, it } from "vitest";
import { collectionState } from "./format";

describe("حالة فلوس الأوردر", () => {
  const base = {
    order_status: "shipped",
    bosta_state: "Processing",
    bosta_collected: false,
  };

  it("العميل دفع بس بوسطة لسه ماحوّلتش = مع بوسطة", () => {
    // الغلط القديم: كانت بتقول "وصلت" أول ما يتسلّم. وبوسطة بتقعد بالفلوس
    // يوم أو أكتر وبتحوّل بدفعات — فالفلوس تبان وصلت وهي في محفظتهم.
    expect(collectionState({ ...base, bosta_collected: true }).label).toBe(
      "مع بوسطة"
    );
  });

  it("بوسطة حوّلت وأكّدنا = وصلت", () => {
    expect(
      collectionState({
        ...base,
        bosta_collected: true,
        cash_received_at: "2026-07-30T10:00:00Z",
      }).label
    ).toBe("وصلت");
  });

  it("لسه في السكة = لسه", () => {
    expect(collectionState(base).label).toBe("لسه");
  });

  it("رجع ومتسلمش = مش جاية، مش لسه", () => {
    // "لسه" كانت بتوهم إن فيه تحصيل مستنّي وهو مش جاي خلاص
    expect(collectionState({ ...base, order_status: "returned" }).label).toBe(
      "مش جاية"
    );
  });

  it("مرتجع بعد التسليم = رجّعتها للعميل", () => {
    expect(
      collectionState({ ...base, order_status: "returned_after_delivery" }).label
    ).toBe("رجّعتها للعميل");
  });

  it("ملغي", () => {
    expect(collectionState({ ...base, order_status: "cancelled" }).label).toBe(
      "ملغي"
    );
  });

  it("لسه مااتبعتش لبوسطة = شرطة", () => {
    expect(collectionState({ ...base, bosta_state: null }).label).toBe("—");
  });

  it("الفلوس اللي اتحصّلت بتكسب على أي حالة تانية", () => {
    // لو بوسطة قالت اتحصّلت، ماينفعش نقول "مش جاية"
    expect(
      collectionState({
        ...base,
        order_status: "returned",
        bosta_collected: true,
      }).label
    ).toBe("مع بوسطة");
  });

  it("والتحويل المؤكّد بيكسب على الكل", () => {
    expect(
      collectionState({
        ...base,
        order_status: "returned",
        bosta_collected: true,
        cash_received_at: "2026-07-30T10:00:00Z",
      }).label
    ).toBe("وصلت");
  });
});

import { describe, expect, it } from "vitest";
import {
  SHOULD_HAVE_SHIPMENT,
  compareCoverage,
  lastTen,
  type CoverageOrder,
  type CoverageShipment,
} from "./coverage";

const order = (o: Partial<CoverageOrder> = {}): CoverageOrder => ({
  id: o.id ?? "o1",
  orderNumber: o.orderNumber ?? "1400",
  status: o.status ?? "delivered",
  tracking: o.tracking ?? null,
  customerPhone: o.customerPhone ?? null,
});

const ship = (s: Partial<CoverageShipment> = {}): CoverageShipment => ({
  trackingNumber: s.trackingNumber ?? "12345678",
  businessReference: s.businessReference ?? null,
  receiverPhone: s.receiverPhone ?? null,
  ...s,
});

describe("آخر ١٠ أرقام في التليفون", () => {
  // بوسطة بتكتب الرقم عالمي وإحنا محلي — نفس الفخ المسجّل في جلب شوبيفاي
  it("بيوحّد الشكل العالمي والمحلي", () => {
    expect(lastTen("+201005361491")).toBe(lastTen("01005361491"));
    expect(lastTen("+20 100 536 1491")).toBe("1005361491");
  });

  it("الفاضي والقصير مابيكسروش حاجة", () => {
    expect(lastTen(null)).toBe("");
    expect(lastTen("123")).toBe("123");
  });
});

describe("المطابقة برقم التتبع", () => {
  it("متطابقة", () => {
    const r = compareCoverage(
      [ship({ trackingNumber: "999" })],
      [order({ tracking: "999" })]
    );
    expect(r.matched).toBe(1);
    expect(r.onlyInBosta).toHaveLength(0);
    expect(r.onlyInSystem).toHaveLength(0);
  });
});

describe("المطابقة برقم الأوردر عند بوسطة", () => {
  it("الشحنة اللي اتعملت من السيستم بتتلاقي حتى لو التتبع اتغيّر", () => {
    const r = compareCoverage(
      [ship({ trackingNumber: "777", businessReference: "1400" })],
      [order({ orderNumber: "1400", tracking: null })]
    );
    expect(r.matched).toBe(1);
    expect(r.onlyInSystem).toHaveLength(0);
  });
});

describe("المطابقة بالتليفون — آخر ملجأ", () => {
  it("عميل ليه أوردر واحد مفتوح: بتتلاقي", () => {
    const r = compareCoverage(
      [ship({ receiverPhone: "+201005361491" })],
      [order({ customerPhone: "01005361491" })]
    );
    expect(r.matched).toBe(1);
  });

  // **مانخمّنش** — أوردرين لنفس العميل يعني مانعرفش أنهي واحد، و«متطابقة»
  // على أوردر غلط أسوأ من «مش لاقيينها»
  it("عميل ليه أوردرين: مابنخمّنش", () => {
    const r = compareCoverage(
      [ship({ receiverPhone: "01005361491" })],
      [
        order({ id: "a", orderNumber: "1", customerPhone: "01005361491" }),
        order({ id: "b", orderNumber: "2", customerPhone: "01005361491" }),
      ]
    );
    expect(r.matched).toBe(0);
    expect(r.onlyInBosta).toHaveLength(1);
  });

  it("الأوردر اللي اتاخد مابيتاخدش تاني", () => {
    const r = compareCoverage(
      [
        ship({ trackingNumber: "111", receiverPhone: "01005361491" }),
        ship({ trackingNumber: "222", receiverPhone: "01005361491" }),
      ],
      [order({ id: "a", customerPhone: "01005361491" })]
    );
    expect(r.matched).toBe(1);
    expect(r.onlyInBosta).toHaveLength(1);
  });
});

describe("في بوسطة ومش عندنا", () => {
  it("شحنة مالهاش أي أثر عندنا بتطلع", () => {
    const r = compareCoverage([ship({ trackingNumber: "555" })], []);
    expect(r.onlyInBosta).toHaveLength(1);
    expect(r.onlyInBosta[0].trackingNumber).toBe("555");
  });
});

describe("عندنا ومش في بوسطة", () => {
  it("أوردر متشحن من غير شحنة بيطلع", () => {
    const r = compareCoverage([], [order({ status: "shipped" })]);
    expect(r.onlyInSystem).toHaveLength(1);
  });

  // **الملغي مالوش لازمة في القايمة** — عمره ما هيبقى له شحنة
  it("الملغي والجديد مابيطلعوش", () => {
    const r = compareCoverage(
      [],
      [
        order({ id: "a", status: "cancelled" }),
        order({ id: "b", status: "new" }),
        order({ id: "c", status: "confirmed" }),
      ]
    );
    expect(r.onlyInSystem).toHaveLength(0);
  });

  it("اللي له رقم تتبع مابيطلعش حتى لو بوسطة مارجّعتوش", () => {
    const r = compareCoverage([], [order({ status: "delivered", tracking: "999" })]);
    expect(r.onlyInSystem).toHaveLength(0);
  });

  it("قايمة الحالات فيها اللي بعد التغليف", () => {
    expect(SHOULD_HAVE_SHIPMENT).toContain("shipped");
    expect(SHOULD_HAVE_SHIPMENT).toContain("delivered");
    expect(SHOULD_HAVE_SHIPMENT).not.toContain("cancelled");
    expect(SHOULD_HAVE_SHIPMENT).not.toContain("new");
  });
});

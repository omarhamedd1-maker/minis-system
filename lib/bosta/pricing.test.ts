import { describe, expect, it } from "vitest";
import {
  INSURANCE_PLANS,
  orderSize,
  shipmentPrice,
  type PricingRules,
} from "./pricing";
import { buildPriceTable, defaultBostaRules } from "./price-table";

const rules = defaultBostaRules();

describe("الأرقام الحقيقية من حاسبة بوسطة", () => {
  // دول مقيسين من حاسبة بوسطة نفسها على الحساب الجديد (٣١ يوليو ٢٠٢٦).
  // **لو الاختبارين دول وقعوا، المعادلة اتكسرت** — مش الأرقام هي الغلط.

  it("القاهرة ← القاهرة، صغير، ١٠٠٠ جنيه = ١٠٤.٨٨", () => {
    const p = shipmentPrice(
      {
        zone: "cairo_giza",
        size: "small",
        service: "delivery",
        cod: 1000,
        productValue: 1000,
      },
      rules
    );

    expect(p.base).toBe(81);
    expect(p.transferFee).toBe(11);
    expect(p.vat).toBe(12.88);
    expect(p.total).toBe(104.88);
  });

  it("القاهرة ← أسوان، صغير، ١٠٠٠ جنيه = ١٤٣.٦٤", () => {
    // أسوان في جنوب الصعيد
    const p = shipmentPrice(
      {
        zone: "south_saeed",
        size: "small",
        service: "delivery",
        cod: 1000,
        productValue: 1000,
      },
      rules
    );

    expect(p.base).toBe(115);
    expect(p.transferFee).toBe(11);
    expect(p.vat).toBe(17.64);
    expect(p.total).toBe(143.64);
  });

  it("**الوجهة هي اللي بتغيّر السعر**", () => {
    const same = { size: "small", service: "delivery", cod: 1000, productValue: 1000 } as const;
    const cairo = shipmentPrice({ zone: "cairo_giza", ...same }, rules);
    const sinai = shipmentPrice({ zone: "sinai_wadi", ...same }, rules);

    expect(cairo.base).toBe(81);
    expect(sinai.base).toBe(127);
    expect(sinai.total).toBeGreaterThan(cairo.total);
  });
});

describe("الرسوم", () => {
  it("رسم التحصيل بيتحسب على الزيادة فوق ٣٠٠٠ بس", () => {
    const under = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 3000, productValue: 3000 },
      rules
    );
    expect(under.codFee).toBe(0);

    const over = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 4000, productValue: 4000 },
      rules
    );
    // ١٪ من ١٠٠٠ الزيادة
    expect(over.codFee).toBe(10);
  });

  it("**الحد ٣٠٠٠ مش ٢٠٠٠** — ده كان غلط في الكود القديم", () => {
    const p = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 2500, productValue: 2500 },
      rules
    );
    expect(p.codFee).toBe(0);
  });

  it("رسم فتح الشحنة بيتزاد لو مسموح", () => {
    const closed = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 1000, productValue: 1000 },
      rules
    );
    const open = shipmentPrice(
      {
        zone: "cairo_giza",
        size: "small",
        service: "delivery",
        cod: 1000,
        productValue: 1000,
        allowToOpenPackage: true,
      },
      rules
    );
    expect(open.openFee).toBe(7);
    expect(open.beforeVat - closed.beforeVat).toBe(7);
  });

  it("المرتجع مفيهوش تحصيل ولا تحويل", () => {
    const p = shipmentPrice(
      {
        zone: "cairo_giza",
        size: "small",
        service: "return",
        cod: 5000,
        productValue: 5000,
        returned: true,
      },
      rules
    );
    expect(p.codFee).toBe(0);
    expect(p.transferFee).toBe(0);
    // سعر الإرجاع نفسه بيفضل
    expect(p.base).toBe(102);
  });
});

describe("التأمين", () => {
  it("**صفر افتراضيًا** — الحساب الجديد من غير تأمين", () => {
    const p = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 1000, productValue: 5000 },
      rules
    );
    expect(p.insurance).toBe(0);
  });

  it("باقة أمان: ٠.٥٪ بين ٥ و٢٠", () => {
    const withAman: PricingRules = { ...rules, insurance: INSURANCE_PLANS.aman };

    const small = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 100, productValue: 100 },
      withAman
    );
    expect(small.insurance).toBe(5); // الحد الأدنى

    const mid = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 2000, productValue: 2000 },
      withAman
    );
    expect(mid.insurance).toBe(10); // ٠.٥٪

    const big = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 50000, productValue: 50000 },
      withAman
    );
    expect(big.insurance).toBe(20); // الحد الأقصى
  });

  it("باقة أمان جدًا: ١٪ بين ١٠ و٥٠", () => {
    const plus: PricingRules = { ...rules, insurance: INSURANCE_PLANS.aman_plus };
    const p = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 3000, productValue: 3000 },
      plus
    );
    expect(p.insurance).toBe(30);
  });
});

describe("السعر الناقص", () => {
  it("**مابنخمّنش رقم** لو مش في الجدول", () => {
    // الرقم المخمّن بيدخل حسبة الأرباح ومحدش بياخد باله إنه مش حقيقي
    const empty: PricingRules = { ...rules, table: {} };
    const p = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 1000, productValue: 1000 },
      empty
    );
    expect(p.missingPrice).toBe(true);
    expect(p.base).toBe(0);
  });

  it("والسعر الموجود مابيعلّمش", () => {
    const p = shipmentPrice(
      { zone: "cairo_giza", size: "small", service: "delivery", cod: 1000, productValue: 1000 },
      rules
    );
    expect(p.missingPrice).toBe(false);
  });
});

describe("حجم الأوردر", () => {
  it("بياخد أكبر حجم في البنود", () => {
    // منتج صغير جنب أثاث مابيغيّرش إن دي شحنة أثاث
    expect(orderSize(["small", "huge", "large"])).toBe("huge");
    expect(orderSize(["small", "small"])).toBe("small");
    expect(orderSize(["large", "xl"])).toBe("xl");
  });

  it("الأوردر الفاضي أو اللي بنوده بلا حجم = أصغر حجم", () => {
    expect(orderSize([])).toBe("small");
    expect(orderSize([null, undefined])).toBe("small");
  });

  it("بيتجاهل الناقص ويمشي بالموجود", () => {
    expect(orderSize([null, "big", undefined])).toBe("big");
  });
});

describe("الجدول", () => {
  it("فيه كل المناطق والأحجام والخدمات", () => {
    const table = buildPriceTable();
    expect(Object.keys(table)).toHaveLength(7);
    expect(Object.keys(table.cairo_giza ?? {})).toHaveLength(6);
    expect(Object.keys(table.cairo_giza?.small ?? {})).toHaveLength(5);
  });

  it("الساحل الشمالي بنفس أسعار جنوب الصعيد", () => {
    const table = buildPriceTable();
    expect(table.north_coast?.small?.delivery).toBe(
      table.south_saeed?.small?.delivery
    );
  });

  it("شحنة الأثاث لسيناء = ٩٠٠ مش ٨٨", () => {
    // ده الرقم اللي كان بيتحسب ٨٨ في الكود القديم
    const table = buildPriceTable();
    expect(table.sinai_wadi?.huge?.delivery).toBe(900);
  });
});

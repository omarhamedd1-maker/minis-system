import { describe, expect, it } from "vitest";
import { shippingCost, BOSTA_FEES } from "./shipping-cost";

// الاختبارات دي بتقفل الحسبة على أرقام حقيقية من شاشة بوسطة نفسها.
// لو حد غيّر المعادلة غلط، الاختبار بيقع قبل ما التغيير يوصل لأي عميل.

describe("رسوم بوسطة — أرقام متأكد منها من شاشة بوسطة", () => {
  it("أوردر تحصيله ٣٦٩٠ وقيمته ٣٦٠٠ ← ٩٢.١١ جنيه", () => {
    const c = shippingCost({
      cod: 3690,
      productValue: 3600,
      allowToOpenPackage: true,
    });

    expect(c.openFee).toBe(7);
    expect(c.codFee).toBe(16.9); // ١٪ من اللي فوق الـ٢٠٠٠
    expect(c.transferFee).toBe(36.9); // ١٪ من التحصيل
    expect(c.insurance).toBe(20); // وصل للسقف — مش ٣٦
    expect(c.vat).toBe(11.31);
    expect(c.total).toBe(92.11);
  });

  it("أوردر تحصيله ١٨٦٠ وقيمته ١٧٧٠ ← ٤٩.٣٦ جنيه", () => {
    const c = shippingCost({
      cod: 1860,
      productValue: 1770,
      allowToOpenPackage: true,
    });

    expect(c.openFee).toBe(7);
    expect(c.codFee).toBe(0); // تحت الـ٢٠٠٠ فمفيش عمولة تحصيل
    expect(c.transferFee).toBe(18.6);
    expect(c.insurance).toBe(17.7); // لسه تحت السقف
    expect(c.vat).toBe(6.06);
    expect(c.total).toBe(49.36);
  });
});

describe("سلوك التأمين", () => {
  it("ماينزلش عن الحد الأدنى مهما كانت البضاعة رخيصة", () => {
    const c = shippingCost({ cod: 100, productValue: 50, allowToOpenPackage: true });
    expect(c.insurance).toBe(BOSTA_FEES.insuranceMin);
  });

  it("مايعلاش فوق السقف مهما كانت البضاعة غالية", () => {
    const c = shippingCost({
      cod: 500,
      productValue: 100000,
      allowToOpenPackage: true,
    });
    expect(c.insurance).toBe(BOSTA_FEES.insuranceMax);
  });
});

describe("رسم التحويل", () => {
  it("ليه حد أدنى حتى لو التحصيل صغير", () => {
    const c = shippingCost({ cod: 200, productValue: 200, allowToOpenPackage: true });
    // ١٪ من ٢٠٠ = ٢ جنيه، بس الحد الأدنى ١٣
    expect(c.transferFee).toBe(BOSTA_FEES.transferMin);
  });

  it("أوردر تحصيله ١٢٧٠ رسم تحويله ١٣ مش ١٢.٧", () => {
    const c = shippingCost({ cod: 1270, productValue: 1180, allowToOpenPackage: true });
    expect(c.transferFee).toBe(13);
  });
});

describe("حالات خاصة", () => {
  it("لو الفتح مش مسموح، رسم الفتح بيتشال", () => {
    const c = shippingCost({
      cod: 0,
      productValue: 12299,
      allowToOpenPackage: false,
    });
    expect(c.openFee).toBe(0);
    // تحصيل صفر = مفيش تحويل، فالتأمين بالسقف ٢٠ لوحده × ١.١٤
    expect(c.total).toBe(22.8);
  });

  it("**الأوردر اللي اتحصّل بياخد رسم التحويل** حتى لو بوسطة رجّعت صفر", () => {
    // بوسطة بتصفّر خانة التحصيل بعد ما تحصّل. أوردر ١٣٢٠ (١٢٩٨ + ٩٠ كاش)
    // اتسلّم واتحصّل وبوسطة بترجّع cod صفر — لو حسبناها "مفيش فلوس" كنا
    // هنشيل رسم التحويل من كل أوردر اتسلّم وتكاليفنا تبان أقل من الحقيقة
    const c = shippingCost({
      cod: 0,
      productValue: 1298,
      allowToOpenPackage: true,
      collected: true,
    });
    expect(c.transferFee).toBe(13);
  });

  it("**التحصيل صفر ومااتحصّلش = مفيش رسم تحويل** حتى الحد الأدنى", () => {
    // الحد الأدنى ١٣ بيتطبّق على فلوس بتتحوّل فعلاً، مش على شحنة مافيهاش
    // فلوس. الدليل من شاشة بوسطة: تحصيل صفر وقيمة بضاعة ٥٠٠٠ = ٦٤٫٩٨،
    // و٦٤٫٩٨ ÷ ١٫١٤ = ٥٧ = ٥٠ تأمين + ٧ رسم فتح. مفيش تحويل.
    const c = shippingCost({
      cod: 0,
      productValue: 5000,
      allowToOpenPackage: true,
    });
    expect(c.transferFee).toBe(0);
    expect(c.codFee).toBe(0);
    expect(c.openFee).toBe(7);
  });

  it("أول جنيه تحصيل بيرجّع الحد الأدنى للتحويل", () => {
    const c = shippingCost({ cod: 1, productValue: 500, allowToOpenPackage: true });
    expect(c.transferFee).toBe(13);
  });

  it("المرتجع: مفيش عمولة تحصيل ولا رسم تحويل", () => {
    const c = shippingCost({
      cod: 5000,
      productValue: 4000,
      allowToOpenPackage: true,
      returned: true,
    });
    expect(c.codFee).toBe(0);
    expect(c.transferFee).toBe(0);
    expect(c.openFee).toBe(7);
    expect(c.insurance).toBe(20);
    expect(c.total).toBe(30.78); // (٧ + ٢٠) × ١.١٤
  });

  it("مدخلات فاضية مابتكسرش الحسبة", () => {
    const c = shippingCost({
      cod: Number.NaN,
      productValue: -5,
      allowToOpenPackage: false,
    });
    expect(Number.isFinite(c.total)).toBe(true);
    expect(c.total).toBeGreaterThan(0);
  });
});

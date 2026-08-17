import { describe, expect, it } from "vitest";
import { checkCod, codMismatchMessage } from "./cod-check";

const check = (over: Partial<Parameters<typeof checkCod>[0]> = {}) =>
  checkCod({
    orderStatus: "ready",
    ours: 739,
    bosta: 1388,
    codUpdateBlocked: false,
    alertedAmount: null,
    ...over,
  });

describe("مقارنة التحصيل", () => {
  it("فيه فرق = تنبيه، والفرق بوسطة ناقص عندنا", () => {
    expect(check()).toEqual({ diff: 649, alert: true, fixable: true });
  });

  it("الفرق بالسالب لما بوسطة أقل مننا", () => {
    // أوردر ١٢٤٨ الحقيقي: عندنا ٤٠٨٩ وبوسطة ٧٩٠
    expect(check({ ours: 4089, bosta: 790 }).diff).toBe(-3299);
  });

  it("متطابقين = مفيش تنبيه", () => {
    expect(check({ ours: 1388, bosta: 1388 })).toMatchObject({
      alert: false,
      skip: "matches",
    });
  });

  it("فرق قرش مابيتحسبش", () => {
    expect(check({ ours: 1388, bosta: 1388.5 })).toMatchObject({
      alert: false,
      skip: "matches",
    });
  });

  it("الأوردر خلص خلاص = الفرق تاريخ مش مشكلة", () => {
    for (const s of ["delivered", "returned", "returned_after_delivery", "cancelled"]) {
      expect(check({ orderStatus: s }), s).toMatchObject({
        alert: false,
        skip: "finished",
      });
    }
  });

  it("بوسطة مفيهاش تحصيل خالص = مانقارنش", () => {
    // `null` معناها الشحنة لسه ماتعملتش، أو مرتجع بوسطة مابتقوليش تحصيله
    expect(check({ bosta: null })).toMatchObject({ skip: "no_bosta_value" });
    expect(check({ bosta: undefined })).toMatchObject({ skip: "no_bosta_value" });
  });

  it("⚠️ **بوسطة بتقول صفر وإحنا مستنيين فلوس = تنبيه**", () => {
    // الشرط كان `bosta <= 0` فكان بيبلع أخطر حالة: بوسطة هتسلّم الشحنة
    // وماتحصّلش ولا جنيه، وإحنا ساكتين.
    //
    // الفحص على الداتا الحقيقية لقى **٢٧ أوردر اتسلّموا** تحصيلهم صفر
    // ومحدش دفع مقدم — بإجمالي ٦٣٬٦٩٧ ج، ولا واحد طلّع تنبيه.
    const r = check({ ours: 2037, bosta: 0, orderStatus: "shipped" });
    expect(r.alert).toBe(true);
    expect(r.diff).toBe(-2037);
  });

  it("والمدفوع مقدم بالكامل مايطلّعش تنبيه كاذب", () => {
    // تحصيلنا صفر لأن العميل دفع، وبوسطة صفر — الاتنين متفقين
    expect(check({ ours: 0, bosta: 0, orderStatus: "shipped" })).toMatchObject({
      alert: false,
      skip: "matches",
    });
  });

  it("نفس الفرق مابينبّهش تاني — المزامنة كل ١٥ دقيقة", () => {
    expect(check({ alertedAmount: 649 })).toMatchObject({
      alert: false,
      skip: "already_alerted",
    });
  });

  it("بس لو الفرق اتغيّر بينبّه من جديد", () => {
    expect(check({ alertedAmount: 100 }).alert).toBe(true);
  });

  it("بوسطة قافلة التعديل = تنبيه بس مش قابل للتصليح", () => {
    expect(check({ codUpdateBlocked: true })).toMatchObject({
      alert: true,
      fixable: false,
    });
  });
});

describe("رسالة الفرق", () => {
  it("بترجّع الرقمين وتقول تعمل إيه", () => {
    const m = codMismatchMessage({
      orderNumber: "1374",
      customerName: "محمد فراج",
      ours: 739,
      bosta: 1388,
      fixable: true,
    });
    expect(m).toContain("1374");
    expect(m).toContain("محمد فراج");
    expect(m).toContain("739");
    expect(m).toContain("1388");
    expect(m).toContain("ابعت رقمنا لبوسطة");
  });

  it("مش قابل للتصليح = بتقول إن المندوب ماشي بالمبلغ القديم", () => {
    const m = codMismatchMessage({
      orderNumber: "1",
      customerName: null,
      ours: 100,
      bosta: 200,
      fixable: false,
    });
    expect(m).toContain("المندوب ماشي");
    expect(m).not.toContain("undefined");
  });

  it("بتفتكّر إن الفرق ممكن يكون مقصود", () => {
    const m = codMismatchMessage({
      orderNumber: "1248",
      customerName: null,
      ours: 4089,
      bosta: 790,
      fixable: true,
    });
    expect(m).toContain("تجاهل");
  });
});

describe("رسالة الصفر", () => {
  it("بتقول إن بوسطة مش هتحصّل حاجة، مش «التحصيل مختلف»", () => {
    const m = codMismatchMessage({
      orderNumber: 1419,
      customerName: "أمينة فتحي",
      ours: 2037,
      bosta: 0,
      fixable: true,
    });
    expect(m).toContain("مش هتحصّل حاجة");
    expect(m).toContain("2037");
    expect(m).not.toContain("التحصيل مختلف");
  });

  it("والفرق العادي رسالته زي ما هي", () => {
    const m = codMismatchMessage({
      orderNumber: 1248,
      customerName: null,
      ours: 4089,
      bosta: 790,
      fixable: true,
    });
    expect(m).toContain("التحصيل مختلف");
  });
});

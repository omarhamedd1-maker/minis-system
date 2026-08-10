import { describe, expect, it } from "vitest";
import {
  mentionsOrder,
  planPrepaidCash,
  prepaidDescription,
  toLatinDigits,
  type CashRow,
  type PrepaidOrder,
} from "./prepaid-cash";

const order = (o: Partial<PrepaidOrder> = {}): PrepaidOrder => ({
  id: o.id ?? "o1",
  orderNumber: o.orderNumber ?? "1406",
  amountPaid: o.amountPaid ?? 1000,
  paymentMethod: o.paymentMethod ?? "cod",
  orderDate: o.orderDate ?? "2026-08-08",
});

const cash = (c: Partial<CashRow> = {}): CashRow => ({
  id: c.id ?? "c1",
  direction: c.direction ?? "in",
  amount: c.amount ?? 1000,
  description: c.description ?? null,
  relatedOrderId: c.relatedOrderId ?? null,
});

describe("توحيد الأرقام", () => {
  // **عمر بيكتب بأرقام عربي والأوردر متخزّن إنجليزي** — من غير التوحيد
  // ده السيستم بيشوف إن مفيش سطر ويكتب واحد تاني
  it("العربي بيتحوّل لإنجليزي", () => {
    expect(toLatinDigits("اوردر ١٤٠٩")).toBe("اوردر 1409");
    expect(toLatinDigits("۱۴۰۹")).toBe("1409");
    expect(toLatinDigits("1409")).toBe("1409");
    expect(toLatinDigits(null)).toBe("");
  });
});

describe("الوصف بيتكلم عن الأوردر ده؟", () => {
  it("بيلاقي الرقم عربي أو إنجليزي", () => {
    expect(mentionsOrder("مقدم اوردر ١٤٠٦", "1406")).toBe(true);
    expect(mentionsOrder("اوردر 1406 مدفوع انستا", "1406")).toBe(true);
    expect(mentionsOrder("اوردر ١٤٠٩ مدفوع انستا", "1409")).toBe(true);
  });

  // **الرقم كامل مش جزء من رقم أطول** — وإلا سطر واحد يغطي عشرة
  it("مايطابقش جزء من رقم أطول", () => {
    expect(mentionsOrder("مقدم اوردر ١٤٠٦٧", "1406")).toBe(false);
    expect(mentionsOrder("اوردر ٢١٤٠٦", "1406")).toBe(false);
  });

  it("الفاضي بيرجع false", () => {
    expect(mentionsOrder("تحصيل", "1406")).toBe(false);
    expect(mentionsOrder(null, "1406")).toBe(false);
    expect(mentionsOrder("اوردر ١٤٠٦", null)).toBe(false);
  });
});

describe("خطة تسجيل الفلوس المقدمة", () => {
  it("**السطر اللي عمر كاتبه بيتربط، ومابيتزوّدش سطر تاني**", () => {
    const p = planPrepaidCash(
      [order({ orderNumber: "1406", amountPaid: 1000 })],
      [cash({ id: "c9", amount: 1000, description: "مقدم اوردر ١٤٠٦" })]
    );
    expect(p.toAdd).toHaveLength(0);
    expect(p.toAdopt).toEqual([{ order: expect.anything(), cashId: "c9" }]);
  });

  it("الأوردر اللي مفيش ليه سطر بيتسجّل", () => {
    const p = planPrepaidCash(
      [order({ id: "x", orderNumber: "1336", amountPaid: 11978, paymentMethod: "instapay" })],
      [cash({ description: "تحصيل" })]
    );
    expect(p.toAdd).toHaveLength(1);
    expect(p.toAdd[0].amount).toBe(11978);
  });

  it("المربوط خلاص مابيتلمسش", () => {
    const p = planPrepaidCash(
      [order({ id: "x" })],
      [cash({ relatedOrderId: "x" })]
    );
    expect(p.toAdd).toHaveLength(0);
    expect(p.toAdopt).toHaveLength(0);
    expect(p.alreadyDone).toBe(1);
  });

  it("اللي مفيهوش مقدم مابيدخلش الخطة", () => {
    const p = planPrepaidCash([order({ amountPaid: 0 })], []);
    expect(p.toAdd).toHaveLength(0);
  });

  // سطر واحد مايغطّيش أوردرين
  it("السطر المتاخد مابيتاخدش تاني", () => {
    const p = planPrepaidCash(
      [
        order({ id: "a", orderNumber: "1406" }),
        order({ id: "b", orderNumber: "1406" }),
      ],
      [cash({ id: "c1", description: "مقدم اوردر ١٤٠٦" })]
    );
    expect(p.toAdopt).toHaveLength(1);
    expect(p.toAdd).toHaveLength(1);
  });

  // **الخروج مش دخول** — مصروف رقمه فيه رقم الأوردر مايتحسبش تحصيل
  it("حركة خروج مابتتحسبش", () => {
    const p = planPrepaidCash(
      [order({ orderNumber: "1406" })],
      [cash({ direction: "out", description: "مصروف اوردر ١٤٠٦" })]
    );
    expect(p.toAdd).toHaveLength(1);
    expect(p.toAdopt).toHaveLength(0);
  });
});

describe("وصف السطر اللي السيستم بيكتبه", () => {
  // الرقم بيتلف بعلامتين عزل مالهمش شكل — عشان مايقفزش لآخر السطر جوّه
  // الجملة العربي. بنشيلهم في المقارنة عشان الاختبار يقرا زي البني آدم.
  const seen = (s: string) => s.replace(/[⁦⁩]/g, "");

  it("بيفرّق بين انستا والمقدم", () => {
    expect(
      seen(prepaidDescription(order({ paymentMethod: "instapay", orderNumber: "1409" })))
    ).toBe("انستا باي أوردر 1409");
    expect(
      seen(prepaidDescription(order({ paymentMethod: "cod", orderNumber: "1406" })))
    ).toBe("مقدم أوردر 1406");
  });

  it("**رقم الأوردر معزول** عشان مايتلخبطش في الجملة العربي", () => {
    const out = prepaidDescription(order({ orderNumber: "1406" }));
    expect(out).toContain("⁦1406⁩");
  });
});

describe("الحالة الملخبطة — سطر بنفس المبلغ برقم أوردر تاني", () => {
  // **حصلت فعلًا**: عمر كتب «ديبوزت اوردر ١٤١٣» بـ٣٠٠، والأوردر اللي فيه
  // مقدم ٣٠٠ هو ١٤١٦. يا غلطة كتابة، يا ١٤١٣ فعلًا خد ٣٠٠ ومتسجّلش عليه.
  it("مابنضيفش — بنوقف ونسيبها تتراجع", () => {
    const p = planPrepaidCash(
      [order({ id: "x", orderNumber: "1416", amountPaid: 300 })],
      [cash({ id: "c5", amount: 300, description: "ديبوزت اوردر ١٤١٣" })]
    );
    expect(p.toAdd).toHaveLength(0);
    expect(p.needsReview).toHaveLength(1);
    expect(p.needsReview[0].cashDescription).toBe("ديبوزت اوردر ١٤١٣");
  });

  it("مبلغ مختلف؟ بيتسجّل عادي", () => {
    const p = planPrepaidCash(
      [order({ id: "x", orderNumber: "1416", amountPaid: 300 })],
      [cash({ id: "c5", amount: 999, description: "ديبوزت اوردر ١٤١٣" })]
    );
    expect(p.toAdd).toHaveLength(1);
    expect(p.needsReview).toHaveLength(0);
  });

  // الرقم الصح بيكسب على المبلغ المتشابه
  it("السطر اللي فيه رقم الأوردر بيتاخد قبل اللي بنفس المبلغ", () => {
    const p = planPrepaidCash(
      [order({ id: "x", orderNumber: "1416", amountPaid: 300 })],
      [
        cash({ id: "wrong", amount: 300, description: "ديبوزت اوردر ١٤١٣" }),
        cash({ id: "right", amount: 300, description: "مقدم اوردر ١٤١٦" }),
      ]
    );
    expect(p.toAdopt).toHaveLength(1);
    expect(p.toAdopt[0].cashId).toBe("right");
    expect(p.needsReview).toHaveLength(0);
  });
});

describe("الأوردر اللي قبل بداية الخزنة", () => {
  // **حصلت فعلًا**: أوردر ١٣٣٦ (انستا ١١٬٩٧٨) من ٨ يوليو اتسجّل،
  // والخزنة بدأت ٣ أغسطس برصيد افتتاحي شامله — فالرصيد طلع أعلى
  // بـ١١٬٩٧٨ من الحقيقة، وعمر شافها.
  it("مابيتسجّلش — فلوسه في الرصيد الافتتاحي", () => {
    const p = planPrepaidCash(
      [order({ id: "x", orderNumber: "1336", amountPaid: 11978, orderDate: "2026-07-08" })],
      [],
      "2026-08-03"
    );
    expect(p.toAdd).toHaveLength(0);
    expect(p.beforeCashStarted).toBe(1);
  });

  it("اللي بعد البداية بيتسجّل عادي", () => {
    const p = planPrepaidCash(
      [order({ id: "x", orderNumber: "1416", amountPaid: 300, orderDate: "2026-08-10" })],
      [],
      "2026-08-03"
    );
    expect(p.toAdd).toHaveLength(1);
  });

  // **نفس اليوم برضه بره** — الرصيد الافتتاحي صورة للفلوس لحظة كتابته،
  // واللي في نفس اليوم جوّاه. أوردر ١٣٣٦ كان بنفس تاريخ الرصيد بالظبط.
  it("نفس يوم البداية مابيتسجّلش", () => {
    const p = planPrepaidCash(
      [order({ id: "x", amountPaid: 500, orderDate: "2026-08-03" })],
      [],
      "2026-08-03"
    );
    expect(p.toAdd).toHaveLength(0);
    expect(p.beforeCashStarted).toBe(1);
  });

  // الخزنة فاضية = مفيش رصيد افتتاحي = مفيش حاجة تتمنع
  it("مفيش تاريخ بداية؟ كل حاجة بتتسجّل", () => {
    const p = planPrepaidCash(
      [order({ id: "x", amountPaid: 500, orderDate: "2020-01-01" })],
      [],
      null
    );
    expect(p.toAdd).toHaveLength(1);
  });
});

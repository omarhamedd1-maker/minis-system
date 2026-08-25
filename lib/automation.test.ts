import { describe, it, expect } from "vitest";
import {
  runRules,
  checkRule,
  hitMessage,
  hitTag,
  TRIGGERS,
  DIRECTION,
  hitHref,
  amount,
  type Rule,
  type Fact,
} from "./automation";

const rule = (x: Partial<Rule> = {}): Rule => ({
  id: "r1",
  trigger: "order_waiting",
  threshold: 3,
  active: true,
  ...x,
});

const fact = (x: Partial<Fact> = {}): Fact => ({
  trigger: "order_waiting",
  subjectId: "o1",
  label: "#1142 محمد",
  value: 5,
  ...x,
});

describe("تشغيل القواعد", () => {
  it("اللي عدّى الحد بينبّه", () => {
    const hits = runRules([rule()], [fact()]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ ruleId: "r1", value: 5, threshold: 3 });
  });

  it("⚠️ أكبر من الحد مش أكبر من أو يساوي — «بعد ٣ أيام» يعني في الرابع", () => {
    expect(runRules([rule({ threshold: 3 })], [fact({ value: 3 })])).toEqual([]);
    expect(runRules([rule({ threshold: 3 })], [fact({ value: 4 })])).toHaveLength(1);
  });

  it("القاعدة المقفولة مابترنّش", () => {
    expect(runRules([rule({ active: false })], [fact()])).toEqual([]);
  });

  it("⚠️ القاعدة الغلط بتتخطّى مش بتوقّع", () => {
    const bad = rule({ threshold: 0 });
    expect(() => runRules([bad], [fact()])).not.toThrow();
    expect(runRules([bad], [fact()])).toEqual([]);
  });

  it("كل قاعدة على نوعها بس", () => {
    const hits = runRules(
      [rule({ trigger: "order_waiting" })],
      [fact({ trigger: "stock_low", value: 99 })]
    );
    expect(hits).toEqual([]);
  });

  it("قاعدتين على نفس الحاجة = تنبيهين", () => {
    const hits = runRules(
      [rule({ id: "a", threshold: 2 }), rule({ id: "b", threshold: 4 })],
      [fact({ value: 5 })]
    );
    expect(hits.map((h) => h.ruleId).sort()).toEqual(["a", "b"]);
  });

  it("الأبعد عن الحد الأول", () => {
    const hits = runRules(
      [rule()],
      [
        fact({ subjectId: "قريب", value: 4 }),
        fact({ subjectId: "بعيد", value: 20 }),
      ]
    );
    expect(hits.map((h) => h.subjectId)).toEqual(["بعيد", "قريب"]);
  });

  it("مافيش قواعد ولا حقايق = مافيش تنبيهات", () => {
    expect(runRules([], [fact()])).toEqual([]);
    expect(runRules([rule()], [])).toEqual([]);
  });
});

describe("فحص القاعدة", () => {
  it("السليمة بتعدّي", () => {
    expect(checkRule({ trigger: "order_waiting", threshold: 3 })).toEqual({
      ok: true,
    });
  });

  it("⚠️⚠️ صفر يوم معناها تنبيه على كل أوردر جديد", () => {
    const r = checkRule({ trigger: "order_waiting", threshold: 0 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("كل أوردر جديد");
  });

  it("⚠️ الرقم الخيالي = قاعدة عمرها ما هترن", () => {
    const r = checkRule({ trigger: "order_waiting", threshold: 400 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("عمرها ما هترن");
  });

  it("⚠️ حد الفلوس مالوش سقف — أوردر بمليون حاجة واردة", () => {
    expect(checkRule({ trigger: "big_order", threshold: 1_000_000 }).ok).toBe(true);
  });

  it("النوع اللي مش معروف بيترفض", () => {
    expect(checkRule({ trigger: "حاجة", threshold: 3 }).ok).toBe(false);
  });

  it("اللي مش رقم بيترفض", () => {
    expect(checkRule({ trigger: "big_order", threshold: NaN }).ok).toBe(false);
  });
});

describe("نص التنبيه والتاج", () => {
  it("⚠️ بيقول اللي حصل والحد من غير ما يقول اعمل إيه", () => {
    const [hit] = runRules([rule()], [fact()]);
    const text = hitMessage(hit);
    expect(text).toContain(TRIGGERS.order_waiting);
    expect(text).toContain("#1142");
    expect(text).toContain("حدك");
    expect(text).not.toContain("لازم");
    expect(text).not.toContain("اعمل");
  });

  it("الوحدات بتتكتب صح", () => {
    const days = runRules([rule()], [fact({ value: 5 })])[0];
    expect(hitMessage(days)).toContain("5 أيام");

    const money = runRules(
      [rule({ trigger: "big_order", threshold: 3000 })],
      [fact({ trigger: "big_order", value: 5000 })]
    )[0];
    expect(hitMessage(money)).toContain("جنيه");

    const units = runRules(
      [rule({ trigger: "stock_low", threshold: 5 })],
      [fact({ trigger: "stock_low", value: 2 })]
    )[0];
    expect(hitMessage(units)).toContain("قطعتين");
  });

  it("«يومين» مش «٢ أيام»", () => {
    const hit = runRules([rule({ threshold: 1 })], [fact({ value: 2 })])[0];
    expect(hitMessage(hit)).toContain("يومين");
  });

  it("⚠️⚠️ التاج بالقاعدة والحالة مش باليوم — الأوردر بيتقال عليه مرة", () => {
    const [hit] = runRules([rule()], [fact()]);
    expect(hitTag(hit)).toBe("rule-r1-o1");
    // نفس الأوردر بكرة = نفس التاج = مفيش تكرار
    expect(hitTag({ ...hit, value: 99 })).toBe("rule-r1-o1");
  });

  it("قاعدتين على نفس الأوردر = تاجين مختلفين", () => {
    const hits = runRules(
      [rule({ id: "a", threshold: 2 }), rule({ id: "b", threshold: 3 })],
      [fact()]
    );
    expect(new Set(hits.map(hitTag)).size).toBe(2);
  });
});

describe("⚠️⚠️ المخزون بالعكس", () => {
  const stock = (threshold: number) =>
    rule({ trigger: "stock_low", threshold });
  const qty = (value: number, id = "v1") =>
    fact({ trigger: "stock_low", subjectId: id, label: "تيشيرت لارج", value });

  it("اللي نزل تحت الحد بينبّه", () => {
    expect(runRules([stock(5)], [qty(2)])).toHaveLength(1);
  });

  it("⚠️ اللي عنده كتير مابينبّهش — عكس باقي القواعد", () => {
    expect(runRules([stock(5)], [qty(50)])).toEqual([]);
  });

  it("اللي على الحد بالظبط لسه كويس", () => {
    expect(runRules([stock(5)], [qty(5)])).toEqual([]);
    expect(runRules([stock(5)], [qty(4)])).toHaveLength(1);
  });

  it("الأقل الأول — الأبعد عن الحد", () => {
    const hits = runRules([stock(10)], [qty(8, "قريب"), qty(1, "بعيد")]);
    expect(hits.map((h) => h.subjectId)).toEqual(["بعيد", "قريب"]);
  });

  it("⚠️ الرابط للمنتج مش للأوردر", () => {
    expect(hitHref("stock_low", "v1")).toBe("/products?variant=v1");
    expect(hitHref("order_waiting", "o1")).toBe("/orders/o1");
  });

  it("الأنواع كلها ليها اتجاه", () => {
    for (const t of Object.keys(TRIGGERS)) {
      expect(DIRECTION[t as keyof typeof TRIGGERS]).toBeDefined();
    }
  });
});

describe("صياغة الأرقام", () => {
  it("⚠️ الأيام بتتقرّب — «٣٣٫٨ أيام» مالهاش لازمة", () => {
    expect(amount(33.8, "days")).toBe("34 أيام");
    expect(amount(1.4, "days")).toBe("يوم");
    expect(amount(2.2, "days")).toBe("يومين");
  });

  it("الفلوس بفاصلة الآلاف", () => {
    expect(amount(7589, "money")).toContain("جنيه");
    expect(amount(7589, "money")).not.toContain("7589");
  });

  it("القطع بالمثنى", () => {
    expect(amount(1, "units")).toBe("قطعة");
    expect(amount(2, "units")).toBe("قطعتين");
    expect(amount(5, "units")).toBe("5 قطع");
  });
});

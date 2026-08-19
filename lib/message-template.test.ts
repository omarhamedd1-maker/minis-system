import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  validateTemplate,
  DEFAULT_FOLLOWUP_TEMPLATE,
  MAX_TEMPLATE_LENGTH,
} from "./message-template";

describe("قالب الرسالة", () => {
  it("بيملا الخانات", () => {
    const out = renderTemplate("أهلًا {الاسم}، أوردر {رقم الأوردر} وصلك؟", {
      الاسم: "مروة",
      "رقم الأوردر": "1367",
    });
    expect(out).toBe("أهلًا مروة، أوردر 1367 وصلك؟");
  });

  it("⚠️ الخانة الفاضية بتتشال هي والمسافة — مابتفضلش مكتوبة", () => {
    const out = renderTemplate("أهلًا {الاسم} 👋", {});
    expect(out).toBe("أهلًا 👋");
    expect(out).not.toContain("{");
  });

  it("السطر اللي فضي بعد القص بيتشال", () => {
    const out = renderTemplate("سطر\n{المنتج}\nسطر تاني", {});
    expect(out).toBe("سطر\nسطر تاني");
  });

  it("⚠️ الخانة الغلط بتفضل زي ما هي عشان صاحب المتجر يشوفها", () => {
    const out = renderTemplate("أهلًا {حاجة غلط}", { الاسم: "مروة" });
    expect(out).toContain("{حاجة غلط}");
  });

  it("الفاضي بيرجع القالب الافتراضي", () => {
    expect(renderTemplate("", { الاسم: "عمر" })).toContain("أهلًا عمر");
    expect(renderTemplate(null, {})).toContain("كل حاجة تمام؟");
    expect(renderTemplate("   ", {})).toBe(
      renderTemplate(DEFAULT_FOLLOWUP_TEMPLATE, {})
    );
  });

  it("نفس الخانة أكتر من مرة بتتملى كلها", () => {
    expect(renderTemplate("{الاسم} يا {الاسم}", { الاسم: "عمر" })).toBe(
      "عمر يا عمر"
    );
  });

  it("القيمة اللي مسافات بس بتتعامل كفاضية", () => {
    expect(renderTemplate("أهلًا {الاسم}!", { الاسم: "   " })).toBe("أهلًا !");
  });
});

describe("فحص القالب", () => {
  it("التمام بيعدّي", () => {
    expect(validateTemplate("أهلًا {الاسم} — {المنتج}")).toBeNull();
    expect(validateTemplate(DEFAULT_FOLLOWUP_TEMPLATE)).toBeNull();
  });

  it("الفاضي بيترفض", () => {
    expect(validateTemplate("")).toBe("الرسالة فاضية");
    expect(validateTemplate("   ")).toBe("الرسالة فاضية");
  });

  it("الخانة اللي مش موجودة بتتقال بالاسم", () => {
    const err = validateTemplate("أهلًا {اسم العميل}")!;
    expect(err).toContain("{اسم العميل}");
    expect(err).toContain("{الاسم}");
  });

  it("الطويل بيترفض ومعاه الرقم", () => {
    const err = validateTemplate("ا".repeat(MAX_TEMPLATE_LENGTH + 1))!;
    expect(err).toContain(String(MAX_TEMPLATE_LENGTH));
  });
});

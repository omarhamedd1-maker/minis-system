import { describe, expect, it } from "vitest";
import {
  MESSAGE_KINDS,
  kindInfo,
  templateFor,
  allTemplates,
  mergeTemplate,
} from "./message-kinds";
import { renderTemplate, validateTemplate } from "./message-template";

describe("رسايل العميل", () => {
  it("أربع مواقف، وكل واحد ليه نص افتراضي", () => {
    expect(MESSAGE_KINDS.map((k) => k.key)).toEqual([
      "confirm",
      "rescue",
      "followup",
      "general",
    ]);
    for (const k of MESSAGE_KINDS) expect(k.fallback.trim()).not.toBe("");
  });

  it("⚠️⚠️ كل نص افتراضي بيعدّي الفحص — يعني مافيش خانة غلط بتوصل للعميل", () => {
    for (const k of MESSAGE_KINDS) {
      expect(validateTemplate(k.fallback), k.key).toBeNull();
    }
  });

  it("⚠️ والنص بيفضل جملة مفهومة لو كل الخانات فاضية", () => {
    for (const k of MESSAGE_KINDS) {
      const out = renderTemplate(k.fallback, {});
      expect(out.trim(), k.key).not.toBe("");
      // مافيش قوس فاضل ولا مسافتين ورا بعض
      expect(out, k.key).not.toMatch(/[{}]/);
      expect(out, k.key).not.toMatch(/ {2}/);
    }
  });

  it("المتخزّن بيكسب الافتراضي", () => {
    const t = templateFor("confirm", { templates: { confirm: "نصي أنا" } });
    expect(t).toBe("نصي أنا");
  });

  it("⚠️ الفاضي مش نص — بيرجع للافتراضي", () => {
    expect(templateFor("confirm", { templates: { confirm: "   " } })).toBe(
      kindInfo("confirm")!.fallback
    );
    expect(templateFor("confirm", { templates: null })).toBe(
      kindInfo("confirm")!.fallback
    );
  });

  it("⚠️⚠️ العمود القديم بتاع «اسأل بعد التسليم» لسه بيتقرا", () => {
    // عمر عدّله فعلًا من الشاشة — ولو تجاهلناه كلامه بيرجع للافتراضي لوحده
    expect(
      templateFor("followup", { followupTemplate: "كلام عمر القديم" })
    ).toBe("كلام عمر القديم");
    // والجديد بيكسب القديم لما الاتنين موجودين
    expect(
      templateFor("followup", {
        templates: { followup: "الجديد" },
        followupTemplate: "القديم",
      })
    ).toBe("الجديد");
  });

  it("⚠️ والعمود القديم مابيأثرش على المواقف التانية", () => {
    expect(
      templateFor("confirm", { followupTemplate: "كلام السؤال بعد التسليم" })
    ).toBe(kindInfo("confirm")!.fallback);
  });

  it("⚠️⚠️ الحفظ بيدمج — مابيمسحش قوالب الشاشات التانية", () => {
    const now = { confirm: "أ", rescue: "ب" };
    const next = mergeTemplate(now, "general", "ج");
    expect(next).toEqual({ confirm: "أ", rescue: "ب", general: "ج" });
  });

  it("الدمج على فاضي بيشتغل", () => {
    expect(mergeTemplate(null, "confirm", " نص ")).toEqual({ confirm: "نص" });
  });

  it("كل القوالب مرة واحدة", () => {
    const all = allTemplates({ templates: { rescue: "خاص" } });
    expect(all.rescue).toBe("خاص");
    expect(all.confirm).toBe(kindInfo("confirm")!.fallback);
    expect(Object.keys(all)).toHaveLength(MESSAGE_KINDS.length);
  });

  it("النوع المش معروف بيرجّع null", () => {
    expect(kindInfo("حاجة")).toBeNull();
  });

  it("الخانات بتتملي في النص الافتراضي", () => {
    const out = renderTemplate(kindInfo("confirm")!.fallback, {
      "الاسم": "أحمد",
      "رقم الأوردر": "1447",
    });
    expect(out).toContain("أحمد");
    expect(out).toContain("1447");
  });
});

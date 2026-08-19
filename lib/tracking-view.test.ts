import { describe, it, expect } from "vitest";
import {
  trackView,
  trackingLink,
  looksLikeOrderId,
  storeWordmark,
} from "./tracking-view";
import { STATUS_COPY } from "./tracking-copy";

describe("صفحة التتبع", () => {
  it("كل حالة ليها عنوان وجملة دلوقتي", () => {
    for (const [status, copy] of Object.entries(STATUS_COPY)) {
      const v = trackView(status);
      expect(v.title, status).toBe(copy.title);
      expect(v.now.length, status).toBeGreaterThan(10);
    }
  });

  it("اللي وصل بيبان إنه خلص", () => {
    expect(trackView("delivered").finished).toBe(true);
    expect(trackView("shipped").finished).toBe(false);
  });

  it("الخطوات اللي عدّت بتتعلّم", () => {
    const v = trackView("shipped");
    expect(v.steps.map((s) => s.done)).toEqual([true, true, false, false, false]);
    expect(v.steps.filter((s) => s.current)).toHaveLength(1);
  });

  it("⚠️ الراجع مافيش خطوة حالية — الرحلة وقفت", () => {
    for (const s of ["returning", "returned", "cancelled"]) {
      expect(trackView(s).steps.some((x) => x.current), s).toBe(false);
    }
  });

  it("⚠️ مفيش أي جملة بتلوم العميل", () => {
    const all = Object.values(STATUS_COPY)
      .map((c) => `${c.title} ${c.now}`)
      .join(" ")
      .toLowerCase();
    for (const bad of ["refused", "not answering", "wrong address", "failed"]) {
      expect(all, bad).not.toContain(bad);
    }
  });

  it("⚠️ الحالة المجهولة بتدّي كلام محايد", () => {
    const v = trackView("حاجة_جديدة");
    expect(v.title).toContain("on the move");
    expect(v.title.toLowerCase()).not.toContain("unknown");
    expect(v.steps).toHaveLength(5);
  });

  it("الفاضي مابيوقعش", () => {
    expect(() => trackView(null)).not.toThrow();
    expect(trackView("").steps).toHaveLength(5);
  });
});

describe("لينك التتبع", () => {
  it("بيتبني على رقم التتبع", () => {
    expect(trackingLink("123456789", "https://x.com")).toBe(
      "https://x.com/track/123456789"
    );
  });

  it("السلاش الزيادة في الآخر بيتشال", () => {
    expect(trackingLink("111", "https://x.com/")).toBe("https://x.com/track/111");
  });

  it("⚠️ من غير شحنة مفيش لينك", () => {
    expect(trackingLink(null)).toBeNull();
    expect(trackingLink("   ")).toBeNull();
  });

  it("مفيش عنوان = الافتراضي", () => {
    expect(trackingLink("111")).toContain("/track/111");
  });
});

describe("اللينك على معرّف الأوردر", () => {
  it("⚠️ موجود من غير شحنة — العميل يطمن قبل ما تتشحن", () => {
    const id = "d76cbcc9-d2df-4d10-a635-fa620a81ec9a";
    expect(trackingLink(id, "https://x.com")).toBe(`https://x.com/track/${id}`);
  });

  it("بيفرّق بين معرّف الأوردر ورقم التتبع", () => {
    expect(looksLikeOrderId("d76cbcc9-d2df-4d10-a635-fa620a81ec9a")).toBe(true);
    expect(looksLikeOrderId("8538298561")).toBe(false);
    expect(looksLikeOrderId("")).toBe(false);
  });
});

describe("اسم المتجر فوق الصفحة", () => {
  it("الاسم العربي بياخد المعرّف اللاتيني", () => {
    expect(storeWordmark("مينيز", "minis")).toBe("MINIS");
    expect(storeWordmark("مينيز", "2-sec")).toBe("2 SEC");
  });

  it("⚠️ الاسم اللاتيني بيتستخدم زي ما هو — أحسن من المعرّف", () => {
    expect(storeWordmark("Mino Demo Store", "demo")).toBe("MINO DEMO STORE");
    expect(storeWordmark("2 SEC", "2-sec")).toBe("2 SEC");
  });

  it("مفيش اسم ولا معرّف = مفيش سطر", () => {
    expect(storeWordmark("مينيز", null)).toBeNull();
    expect(storeWordmark(null, null)).toBeNull();
    expect(storeWordmark("  ", "  ")).toBeNull();
  });
});

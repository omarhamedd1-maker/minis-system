import { describe, it, expect } from "vitest";
import {
  integrationHealth,
  anyDown,
  healthLine,
  agoText,
  type HealthFacts,
} from "./integration-health";

const NOW = new Date("2026-08-20T18:00:00Z");
const minsBack = (n: number) =>
  new Date(NOW.getTime() - n * 60_000).toISOString();

const facts = (over: {
  shopify?: Partial<HealthFacts["shopify"]>;
  bosta?: Partial<HealthFacts["bosta"]>;
} = {}): HealthFacts => ({
  shopify: {
    linked: true,
    probe: { ok: true },
    webhooks: 4,
    lastOrderAt: minsBack(30),
    ...over.shopify,
  },
  bosta: {
    linked: true,
    probe: { ok: true },
    lastSyncAt: minsBack(10),
    lastSyncFailed: false,
    ...over.bosta,
  },
});

const card = (f: HealthFacts, key: "shopify" | "bosta") =>
  integrationHealth(f, NOW).find((c) => c.key === key)!;

describe("صحة الوصلات", () => {
  it("كله شغّال = كله أخضر", () => {
    const cards = integrationHealth(facts(), NOW);
    expect(cards.map((c) => c.state)).toEqual(["ok", "ok"]);
    expect(anyDown(cards)).toBe(false);
    expect(healthLine(cards)).toBe("الوصلات شغّالة.");
  });

  it("⚠️ «مش مربوط» مش «واقع»", () => {
    const cards = integrationHealth(
      facts({ shopify: { linked: false }, bosta: { linked: false } }),
      NOW
    );
    expect(cards.map((c) => c.state)).toEqual(["off", "off"]);
    expect(anyDown(cards)).toBe(false);
    expect(healthLine(cards)).toBe("مافيش وصلة مربوطة لسه.");
  });

  it("المفتاح المرفوض = واقعة، والسبب بيتعرض زي ما جه", () => {
    const c = card(facts({ bosta: { probe: { ok: false, error: "المفتاح مرفوض من بوسطة" } } }), "bosta");
    expect(c.state).toBe("down");
    expect(c.checks[0].detail).toBe("المفتاح مرفوض من بوسطة");
  });

  it("⚠️ المزامنة الواقفة عطل حتى لو المفتاح شغّال", () => {
    const c = card(facts({ bosta: { lastSyncAt: minsBack(400) } }), "bosta");
    expect(c.checks[0].state).toBe("ok");
    expect(c.state).toBe("down");
  });

  it("المزامنة المتأخرة شوية ملاحظة مش عطل", () => {
    const c = card(facts({ bosta: { lastSyncAt: minsBack(90) } }), "bosta");
    expect(c.state).toBe("warn");
  });

  it("المزامنة اللي رجّعت أخطاء ملاحظة", () => {
    const c = card(facts({ bosta: { lastSyncFailed: true } }), "bosta");
    expect(c.state).toBe("warn");
    expect(c.checks[1].detail).toContain("رجّعت أخطاء");
  });

  it("⚠️ المزامنة اللي عمرها ما اشتغلت عطل مش «تمام»", () => {
    const c = card(facts({ bosta: { lastSyncAt: null } }), "bosta");
    expect(c.state).toBe("down");
    expect(c.checks[1].detail).toContain("ولا مرة");
  });

  it("⚠️ سكوت الأوردرات أقصاه ملاحظة — عمره ما يبقى عطل لوحده", () => {
    const c = card(facts({ shopify: { lastOrderAt: minsBack(60 * 24 * 30) } }), "shopify");
    expect(c.state).toBe("warn");
    expect(anyDown(integrationHealth(facts({ shopify: { lastOrderAt: null } }), NOW))).toBe(false);
  });

  it("مافيش ويبهوكس = ملاحظة إن الأوردرات مش بتوصل لوحدها", () => {
    const c = card(facts({ shopify: { webhooks: 0 } }), "shopify");
    expect(c.state).toBe("warn");
    expect(c.checks[1].detail).toContain("مش بتوصل لوحدها");
  });

  it("اللي مااتفحصش مايتقالش عليه تمام", () => {
    const c = card(facts({ shopify: { probe: null, webhooks: null } }), "shopify");
    expect(c.checks[0].state).toBe("warn");
    expect(c.checks[1].state).toBe("warn");
  });

  it("الملخّص بيقول الواقع الأول", () => {
    const cards = integrationHealth(
      facts({ bosta: { probe: { ok: false } }, shopify: { webhooks: 0 } }),
      NOW
    );
    expect(healthLine(cards)).toBe("بوسطة مش رادّة.");
  });

  it("صيغة الوقت", () => {
    expect(agoText(null)).toBe("ولا مرة");
    expect(agoText(0)).toBe("دلوقتي");
    expect(agoText(45)).toBe("من 45 دقيقة");
    expect(agoText(120)).toBe("من 2 ساعة");
    expect(agoText(60 * 24 * 3)).toBe("من 3 يوم");
  });
});

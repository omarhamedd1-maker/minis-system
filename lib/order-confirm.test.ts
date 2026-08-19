import { describe, expect, it } from "vitest";
import {
  applyOutcome,
  MAX_ATTEMPTS,
  nextCallableTime,
  queueDecision,
} from "./order-confirm";

/** ٢ الظهر بتوقيت القاهرة — وقت اتصال مناسب */
const noon = new Date("2026-08-19T11:00:00.000Z");

describe("مين في الطابور", () => {
  it("**الجديد بس هو اللي بيتكلّم**", () => {
    for (const st of ["confirmed", "shipped", "delivered", "cancelled"]) {
      expect(queueDecision({ orderStatus: st, attempts: 0, nextAt: null }, noon))
        .toEqual({ state: "out", why: "not_new" });
    }
    expect(queueDecision({ orderStatus: "new", attempts: 0, nextAt: null }, noon))
      .toEqual({ state: "due" });
  });

  it("ليه ميعاد لسه ماجاش؟ مستني", () => {
    const later = new Date(noon.getTime() + 3_600_000).toISOString();
    expect(
      queueDecision({ orderStatus: "new", attempts: 1, nextAt: later }, noon)
    ).toEqual({ state: "waiting", until: later });
  });

  it("ميعاده عدّى؟ مستحق", () => {
    const past = new Date(noon.getTime() - 60_000).toISOString();
    expect(
      queueDecision({ orderStatus: "new", attempts: 1, nextAt: past }, noon)
    ).toEqual({ state: "due" });
  });

  it("**بعد ٣ محاولات بيقف ويستنى قرار**", () => {
    expect(
      queueDecision({ orderStatus: "new", attempts: MAX_ATTEMPTS, nextAt: null }, noon)
    ).toEqual({ state: "stuck", attempts: MAX_ATTEMPTS });
  });

  it("**تاريخ مش مفهوم بيتعامل كأنه مستحق** — نكلّم مش نسكت", () => {
    expect(
      queueDecision({ orderStatus: "new", attempts: 1, nextAt: "مش تاريخ" }, noon)
    ).toEqual({ state: "due" });
  });
});

describe("مواعيد الاتصال", () => {
  it("الوقت المناسب بيفضل زي ما هو", () => {
    expect(nextCallableTime(noon).toISOString()).toBe(noon.toISOString());
  });

  it("**٣ الفجر بيتأجّل** — مافيش اتصال بالليل", () => {
    // ٣ص القاهرة = ١ص بتوقيت جرينتش صيفًا
    const dawn = new Date("2026-08-19T01:00:00.000Z");
    const out = nextCallableTime(dawn);
    const hour = Number(
      new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Cairo" }).format(out)
    );
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(21);
    expect(out.getTime()).toBeGreaterThan(dawn.getTime());
  });
});

describe("نتيجة المكالمة", () => {
  it("أكّد → الأوردر مؤكد وخرج من الطابور", () => {
    const r = applyOutcome("confirmed", { orderStatus: "new", attempts: 1, nextAt: null }, noon);
    expect(r).toMatchObject({ orderStatus: "confirmed", done: true, nextAt: null });
  });

  it("لغى → الأوردر ملغي", () => {
    const r = applyOutcome("cancelled", { orderStatus: "new", attempts: 0, nextAt: null }, noon);
    expect(r).toMatchObject({ orderStatus: "cancelled", done: true });
  });

  it("**مردّش بتعدّ محاولة وتحجز ميعاد**", () => {
    const r = applyOutcome("no_answer", { orderStatus: "new", attempts: 0, nextAt: null }, noon);
    expect(r.attempts).toBe(1);
    expect(r.done).toBe(false);
    expect(new Date(r.nextAt!).getTime()).toBeGreaterThan(noon.getTime());
  });

  it("**المهلة بتطول مع كل محاولة**", () => {
    const a = applyOutcome("no_answer", { orderStatus: "new", attempts: 0, nextAt: null }, noon);
    const b = applyOutcome("no_answer", { orderStatus: "new", attempts: 1, nextAt: null }, noon);
    expect(new Date(b.nextAt!).getTime()).toBeGreaterThan(new Date(a.nextAt!).getTime());
  });

  it("**آخر محاولة بتوقف الطابور** ومفيش ميعاد جاي", () => {
    const r = applyOutcome("no_answer", { orderStatus: "new", attempts: MAX_ATTEMPTS - 1, nextAt: null }, noon);
    expect(r.attempts).toBe(MAX_ATTEMPTS);
    expect(r.nextAt).toBeNull();
    expect(r.done).toBe(true);
    expect(r.orderStatus).toBeNull();
  });

  it("**«يتصل بعدين» مابتستهلكش محاولة**", () => {
    const r = applyOutcome("later", { orderStatus: "new", attempts: 1, nextAt: null }, noon);
    expect(r.attempts).toBe(1);
    expect(r.done).toBe(false);
    expect(new Date(r.nextAt!).getTime()).toBeGreaterThan(noon.getTime());
  });

  it("أي ميعاد بيرجع بيه بيبقى في وقت اتصال مناسب", () => {
    // ٨م القاهرة + ٨ ساعات = ٤ ص → لازم يتأجّل
    const evening = new Date("2026-08-19T18:00:00.000Z");
    const r = applyOutcome("no_answer", { orderStatus: "new", attempts: 2, nextAt: null }, evening);
    if (r.nextAt) {
      const h = Number(new Intl.DateTimeFormat("en",{hour:"numeric",hourCycle:"h23",timeZone:"Africa/Cairo"}).format(new Date(r.nextAt)));
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThan(21);
    }
  });
});

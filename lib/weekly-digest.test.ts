import { describe, it, expect } from "vitest";
import {
  weeklyDigest,
  worthSending,
  changePercent,
  type DigestInput,
} from "./weekly-digest";

const week = (o: Partial<DigestInput["week"]> = {}) => ({
  sales: 40000,
  net: 8000,
  orders: 20,
  returned: 3,
  settled: 18,
  ...o,
});

const input = (o: Partial<DigestInput> = {}): DigestInput => ({
  storeName: "مينيز",
  week: week(),
  before: week({ sales: 25000, net: 5000, orders: 14 }),
  waiting: { toShip: 0, rescue: 0, atCarrier: 0 },
  ...o,
});

describe("خلاصة الأسبوع", () => {
  it("بتقول المبيعات والصافي وعدد الأوردرات", () => {
    const t = weeklyDigest(input());
    expect(t).toContain("مبيعات");
    expect(t).toContain("صافي");
    expect(t).toContain("20 أوردر");
  });

  it("⚠️ بتقارن بالأسبوع اللي فاته — الرقم لوحده مالوش معنى", () => {
    const t = weeklyDigest(input());
    expect(t).toContain("أكتر 60%");
  });

  it("النزول بيتقال كنزول", () => {
    const t = weeklyDigest(
      input({ week: week({ sales: 20000 }), before: week({ sales: 40000 }) })
    );
    expect(t).toContain("أقل 50%");
  });

  it("الفرق الصغير = زي الأسبوع اللي فات", () => {
    const t = weeklyDigest(
      input({ week: week({ sales: 40000 }), before: week({ sales: 39000 }) })
    );
    expect(t).toContain("زي الأسبوع اللي فات");
  });

  it("⚠️ مافيش أساس نقارن عليه = مفيش مقارنة، مش «زيادة ١٠٠٪»", () => {
    expect(changePercent(1000, 0)).toBeNull();
    const t = weeklyDigest(input({ before: week({ sales: 0, net: 0, orders: 0 }) }));
    expect(t).not.toContain("%أكتر");
  });

  it("نسبة الرجوع على اللي خلص مشواره", () => {
    const t = weeklyDigest(input({ week: week({ returned: 4, settled: 20 }) }));
    expect(t).toContain("رجع 4 من 20 (20%)");
  });

  it("مفيش شحنة خلصت = مفيش سطر رجوع أصلًا", () => {
    const t = weeklyDigest(input({ week: week({ returned: 0, settled: 0 }) }));
    expect(t).not.toContain("رجع");
  });

  it("⚠️ الصافي السالب بيتكتب زي ما هو — ده رقم حقيقي", () => {
    const t = weeklyDigest(input({ week: week({ net: -3000 }) }));
    expect(t).toContain("صافي");
    expect(t).toMatch(/-|−/);
  });

  it("اللي واقف بيتقال في سطر واحد", () => {
    const t = weeklyDigest(
      input({ waiting: { toShip: 7, rescue: 2, atCarrier: 5000 } })
    );
    expect(t).toContain("7 مستني بوليصة");
    expect(t).toContain("2 شحنة واقفة");
    expect(t).toContain("عند بوسطة");
  });

  it("اللي بصفر مايتكتبش", () => {
    const t = weeklyDigest(input({ waiting: { toShip: 0, rescue: 3, atCarrier: 0 } }));
    expect(t).not.toContain("مستني بوليصة");
    expect(t).toContain("3 شحنة واقفة");
  });

  it("أول سطر فيه اسم المتجر", () => {
    expect(weeklyDigest(input()).split("\n")[0]).toContain("مينيز");
    expect(weeklyDigest(input({ storeName: null })).split("\n")[0]).toContain(
      "خلاصة الأسبوع"
    );
  });
});

describe("يستاهل يتبعت؟", () => {
  it("فيه بيع = أيوة", () => {
    expect(worthSending(input())).toBe(true);
  });

  it("⚠️ أسبوع فاضي تمامًا مابيتبعتش — الرسالة اللي بأصفار بتتقفل", () => {
    const empty = input({
      week: week({ sales: 0, net: 0, orders: 0, returned: 0, settled: 0 }),
      waiting: { toShip: 0, rescue: 0, atCarrier: 0 },
    });
    expect(worthSending(empty)).toBe(false);
  });

  it("مافيش بيع بس فيه حاجة واقفة = يتبعت", () => {
    const idle = input({
      week: week({ sales: 0, net: 0, orders: 0, returned: 0, settled: 0 }),
      waiting: { toShip: 4, rescue: 0, atCarrier: 0 },
    });
    expect(worthSending(idle)).toBe(true);
  });
});

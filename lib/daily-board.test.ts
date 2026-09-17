import { describe, it, expect } from "vitest";
import {
  dailyBoard,
  boardIsClear,
  sortByUrgent,
  visibleRows,
  STUCK_DAYS,
  type BoardOrder,
} from "./daily-board";

const NOW = new Date("2026-08-19T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const row = (rows: ReturnType<typeof dailyBoard>, key: string) =>
  rows.find((r) => r.key === key)!;

describe("لوحة اليوم", () => {
  it("بتعدّ الجديد المحتاج تأكيد", () => {
    const rows = dailyBoard(
      [
        { id: "a", orderStatus: "new" },
        { id: "b", orderStatus: "new" },
        { id: "c", orderStatus: "confirmed" },
      ],
      NOW
    );
    expect(row(rows, "confirm").count).toBe(2);
  });

  it("المؤكد اللي معاه رقم تتبع مايتعدّش في المستني بوليصة", () => {
    const orders: BoardOrder[] = [
      { id: "a", orderStatus: "confirmed" },
      { id: "b", orderStatus: "confirmed", bostaTracking: "123" },
      { id: "c", orderStatus: "packed", bostaTracking: "   " },
    ];
    expect(row(dailyBoard(orders, NOW), "ship").count).toBe(2);
  });

  it("الشحنة بتبقى واقفة بعد المدة بس", () => {
    const orders: BoardOrder[] = [
      { id: "a", orderStatus: "shipped", bostaCreatedAt: daysAgo(STUCK_DAYS) },
      { id: "b", orderStatus: "shipped", bostaCreatedAt: daysAgo(STUCK_DAYS - 1) },
      { id: "c", orderStatus: "out_for_delivery", bostaCreatedAt: daysAgo(20) },
    ];
    expect(row(dailyBoard(orders, NOW), "stuck").count).toBe(2);
  });

  it("الشحنة من غير تاريخ مابتتحسبش واقفة", () => {
    const rows = dailyBoard([{ id: "a", orderStatus: "shipped" }], NOW);
    expect(row(rows, "stuck").count).toBe(0);
  });

  it("التاريخ الغلط مابيوقعش الحساب", () => {
    const rows = dailyBoard(
      [{ id: "a", orderStatus: "shipped", bostaCreatedAt: "مش تاريخ" }],
      NOW
    );
    expect(row(rows, "stuck").count).toBe(0);
  });

  it("«فلوس عند بوسطة» اتشالت — صفر دايمًا على الحقيقي", () => {
    const rows = dailyBoard([{ id: "a", orderStatus: "delivered", bostaCod: 500 }], NOW);
    expect(rows.map((r) => r.key)).not.toContain("money");
  });

  describe("⚠️ المرتجع بعد التسليم: مرحلتين والأوردر في واحدة بس", () => {
    const rad = (o: Partial<BoardOrder>): BoardOrder => ({ id: "x", orderStatus: "returned_after_delivery", ...o });
    const where = (o: BoardOrder) => {
      const rows = dailyBoard([o], NOW);
      return ["register", "refund"].filter((k) => row(rows, k).count > 0);
    };

    it("ماتسجّلش = تسجيل بس", () => {
      expect(where(rad({ returnedQty: 0, refundDue: 0 }))).toEqual(["register"]);
    });

    it("اتسجّل وعليه مستحق = ريفند بس", () => {
      expect(where(rad({ returnedQty: 1, refundDue: 700 }))).toEqual(["refund"]);
      expect(row(dailyBoard([rad({ returnedQty: 1, refundDue: 700 })], NOW), "refund").money).toBe(700);
    });

    it("اتسجّل ومفيش مستحق = برّه الاتنين", () => {
      expect(where(rad({ returnedQty: 1, refundDue: 0 }))).toEqual([]);
    });

    it("الريفند اتأكّد = برّه الاتنين", () => {
      expect(where(rad({ returnedQty: 1, refundDue: 700, refundedAt: "2026-08-18" }))).toEqual([]);
    });

    it("مستثنى بعلامة = برّه التسجيل · والعلامة الفاضية مش استثناء", () => {
      expect(where(rad({ returnedQty: 0, returnSkip: "مرتجع قديم" }))).toEqual([]);
      expect(where(rad({ returnedQty: 0, returnSkip: "  " }))).toEqual(["register"]);
    });

    it("حالة تانية مابتدخلش", () => {
      expect(where({ id: "y", orderStatus: "returned", returnedQty: 0 })).toEqual([]);
    });
  });

  it("اللينك بيفتح نفس الأوردرات بالظبط", () => {
    const rows = dailyBoard(
      [
        { id: "a1", orderStatus: "new" },
        { id: "a2", orderStatus: "new" },
      ],
      NOW
    );
    expect(row(rows, "confirm").href).toBe("/orders?only=a1,a2");
  });

  it("العدد الكبير بيرجّع فلتر عادي عشان اللينك مايتقطعش", () => {
    const many: BoardOrder[] = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      orderStatus: "new",
    }));
    expect(row(dailyBoard(many, NOW), "confirm").href).toBe("/orders?status=new");
  });

  it("مافيش أوردرات = اللوحة فاضية ومفيش عاجل", () => {
    const rows = dailyBoard([], NOW);
    expect(rows.every((r) => r.count === 0)).toBe(true);
    expect(boardIsClear(rows)).toBe(true);
  });

  it("الراجعة مش عاجل — دي خبر مش شغل", () => {
    const rows = dailyBoard(
      [
        { id: "a", orderStatus: "returning" },
        { id: "b", orderStatus: "delivered", bostaCod: 100 },
      ],
      NOW
    );
    expect(boardIsClear(rows)).toBe(true);
  });
});

describe("صلاحيات السطور", () => {
  const packer = ["orders.view", "orders.status", "ship.print"];
  const has = (list: string[]) => (perm: string) => list.includes(perm);

  it("موظف التغليف مايشوفش سطر الفلوس خالص", () => {
    const rows = dailyBoard([], NOW);
    const seen = visibleRows(rows, has(packer));
    expect(seen.map((r) => r.key)).not.toContain("refund");
    expect(seen.map((r) => r.key)).toContain("register");
    // والباقي زي ما هو — مش بيتشال معاه
    expect(seen.map((r) => r.key)).toContain("confirm");
  });

  it("اللي معاه cash.view بيشوفه", () => {
    const rows = dailyBoard([], NOW);
    const seen = visibleRows(rows, has([...packer, "cash.view"]));
    expect(seen.map((r) => r.key)).toContain("refund");
  });

  it("الشيل مش تعطيل — السطر مش موجود أصلاً", () => {
    const rows = dailyBoard([], NOW);
    expect(visibleRows(rows, has(packer)).length).toBe(rows.length - 1);
  });
});

describe("sortByUrgent", () => {
  it("العاجل الأول والترتيب جوّه المجموعة زي ما هو", () => {
    const rows = dailyBoard(
      [
        { id: "a", orderStatus: "returning" },
        { id: "b", orderStatus: "awaiting_action" },
      ],
      NOW
    );
    const sorted = sortByUrgent(rows);
    expect(sorted[0].key).toBe("action");
    // غير العاجل محافظ على ترتيبه الأصلي بين بعضه
    const rest = sorted.filter((r) => !r.urgent).map((r) => r.key);
    expect(rest).toEqual(rows.filter((r) => !r.urgent).map((r) => r.key));
  });

  it("مابيغيّرش المصفوفة الأصلية", () => {
    const rows = dailyBoard([{ id: "a", orderStatus: "new" }], NOW);
    const before = rows.map((r) => r.key);
    sortByUrgent(rows);
    expect(rows.map((r) => r.key)).toEqual(before);
  });
});

describe("isStuckShipment", () => {
  it("نفس تعريف سطر «واقفة» — كارت الأوردر بيسأله", async () => {
    const { isStuckShipment } = await import("./daily-board");
    expect(isStuckShipment({ orderStatus: "shipped", bostaCreatedAt: daysAgo(STUCK_DAYS) }, NOW)).toBe(true);
    expect(isStuckShipment({ orderStatus: "shipped", bostaCreatedAt: daysAgo(STUCK_DAYS - 1) }, NOW)).toBe(false);
    expect(isStuckShipment({ orderStatus: "delivered", bostaCreatedAt: daysAgo(30) }, NOW)).toBe(false);
  });
});

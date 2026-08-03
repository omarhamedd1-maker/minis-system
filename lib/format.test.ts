import { describe, expect, it } from "vitest";
import { lastMove } from "./format";

describe("آخر حركة", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  const base = {
    order_status: "shipped",
    order_date: "2026-08-10T09:00:00Z",
    created_at: "2026-08-10T09:00:00Z",
    bosta_created_at: null,
    delivered_at: null,
  };

  it("النهاردة وامبارح بيتكتبوا بالكلام", () => {
    expect(lastMove(base, now).label).toBe("النهاردة");
    expect(
      lastMove(
        { ...base, order_date: "2026-08-09T09:00:00Z", created_at: "2026-08-09T09:00:00Z" },
        now
      ).label
    ).toBe("امبارح");
  });

  it("بياخد أحدث تاريخ نعرفه مش تاريخ الأوردر", () => {
    // الأوردر من ٢٠ يوم بس الشحنة اتعملت امبارح — يبقى اتحرك امبارح
    const m = lastMove(
      {
        ...base,
        order_date: "2026-07-21T09:00:00Z",
        created_at: "2026-07-21T09:00:00Z",
        bosta_created_at: "2026-08-09T09:00:00Z",
      },
      now
    );
    expect(m.days).toBe(1);
  });

  it("الواقف بيولّع", () => {
    const stuck = {
      ...base,
      order_date: "2026-08-05T09:00:00Z",
      created_at: "2026-08-05T09:00:00Z",
    };
    expect(lastMove(stuck, now).className).toContain("amber");

    const worse = {
      ...base,
      order_date: "2026-07-30T09:00:00Z",
      created_at: "2026-07-30T09:00:00Z",
    };
    expect(lastMove(worse, now).className).toContain("red");
  });

  it("اللي خلص مايولّعش — قعاده مش مشكلة", () => {
    // اتسلّم من شهر: مفيش حاجة مستنية فيه
    const delivered = {
      ...base,
      order_status: "delivered",
      order_date: "2026-07-01T09:00:00Z",
      created_at: "2026-07-01T09:00:00Z",
      delivered_at: "2026-07-05T09:00:00Z",
    };
    expect(lastMove(delivered, now).className).toBe("text-gray-500");
    expect(lastMove({ ...delivered, order_status: "cancelled" }, now).className).toBe(
      "text-gray-500"
    );
  });

  it("مفيش أي تاريخ = شرطة", () => {
    expect(
      lastMove({ order_status: "new", order_date: null, created_at: null }, now).label
    ).toBe("—");
  });

  it("تاريخ في المستقبل مايرجّعش أيام بالسالب", () => {
    expect(
      lastMove(
        { ...base, order_date: "2026-08-20T09:00:00Z", created_at: "2026-08-20T09:00:00Z" },
        now
      ).days
    ).toBe(0);
  });
});

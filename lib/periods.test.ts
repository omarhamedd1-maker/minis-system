import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { periodHref, resolvePeriod, shiftDays } from "./periods";

const today = "2026-09-15";

describe("resolvePeriod", () => {
  it("آخر ٧ أيام بتشمل النهارده", () => {
    const r = resolvePeriod({ period: "7d" }, { today, defaultKey: "30d" });
    expect(r).toMatchObject({ key: "7d", start: "2026-09-09", end: today, days: 7 });
  });

  it("آخر ٣٠ يوم", () => {
    const r = resolvePeriod({ period: "30d" }, { today, defaultKey: "7d" });
    expect(r).toMatchObject({ key: "30d", start: "2026-08-17", days: 30 });
  });

  it("الشهر ده من أول الشهر", () => {
    const r = resolvePeriod({ period: "month" }, { today, defaultKey: "30d" });
    expect(r).toMatchObject({ key: "month", start: "2026-09-01", days: 15 });
  });

  it("من غير اختيار = افتراضي الصفحة", () => {
    expect(resolvePeriod({}, { today, defaultKey: "30d" }).key).toBe("30d");
    expect(resolvePeriod({}, { today, defaultKey: "all" })).toMatchObject({ key: "all", start: null, days: null });
  });

  it("⚠️ «كل الوقت» مابتتقبلش في صفحة مش سامحة بيها", () => {
    expect(resolvePeriod({ period: "all" }, { today, defaultKey: "30d" }).key).toBe("30d");
    expect(resolvePeriod({ period: "all" }, { today, defaultKey: "30d", allowAll: true }).key).toBe("all");
  });

  it("مدة مخصصة — يوم واحد لو «إلى» فاضية", () => {
    const r = resolvePeriod({ from: "2026-09-02" }, { today, defaultKey: "30d" });
    expect(r).toMatchObject({ key: "custom", start: "2026-09-02", end: "2026-09-02", days: 1 });
  });

  it("مدة مخصصة مقلوبة بتتعدل", () => {
    const r = resolvePeriod({ from: "2026-09-10", to: "2026-09-01" }, { today, defaultKey: "30d" });
    expect(r).toMatchObject({ start: "2026-09-01", end: "2026-09-10", days: 10 });
  });

  it("⚠️ اللينكات القديمة: today ← يوم النهارده · week ← ٧ أيام · 3m/year ← الافتراضي", () => {
    expect(resolvePeriod({ period: "today" }, { today, defaultKey: "30d" })).toMatchObject({
      key: "custom",
      start: today,
      end: today,
    });
    expect(resolvePeriod({ period: "week" }, { today, defaultKey: "30d" }).key).toBe("7d");
    expect(resolvePeriod({ period: "3m" }, { today, defaultKey: "30d" }).key).toBe("30d");
    expect(resolvePeriod({ period: "year" }, { today, defaultKey: "month" }).key).toBe("month");
  });

  it("التاريخ المش صالح بيتجاهل", () => {
    expect(resolvePeriod({ from: "15-09-2026" }, { today, defaultKey: "7d" }).key).toBe("7d");
  });

  it("shiftDays بيعدّي الشهر", () => {
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("periodHref", () => {
  const q = { status: "new", q: "أحمد", period: "7d", show: "150" };

  it("بيحافظ على باقي الفلاتر ويصفّر اللي اتطلب", () => {
    expect(periodHref("/orders", q, { key: "month" }, "all", ["show"])).toBe(
      `/orders?status=new&q=${encodeURIComponent("أحمد")}&period=month`
    );
  });

  it("الافتراضي مابيتكتبش في اللينك", () => {
    expect(periodHref("/", { period: "7d" }, { key: "30d" }, "30d")).toBe("/");
  });

  it("المدة المخصصة بتشيل period وبتظبط الترتيب", () => {
    expect(periodHref("/", { period: "7d" }, { from: "2026-09-10", to: "2026-09-01" }, "30d")).toBe(
      "/?from=2026-09-01&to=2026-09-10"
    );
  });

  it("المسح بيرجّع الافتراضي", () => {
    expect(periodHref("/expenses", { cat: "إعلانات", from: "2026-09-01", to: "2026-09-02" }, { clear: true }, "30d")).toBe(
      `/expenses?cat=${encodeURIComponent("إعلانات")}`
    );
  });
});

describe("⚠️ مفيش صفحة بتعرّف فتراتها بنفسها", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) files.push(p);
    }
  };
  walk(join(process.cwd(), "app"));
  walk(join(process.cwd(), "components"));

  const OWN_PERIODS = /const\s+\w*PERIODS\s*[:=]/;

  it("الحارس نفسه بيمسك التعريف", () => {
    expect(OWN_PERIODS.test('const ORDER_PERIODS: Record<string, string> = {')).toBe(true);
    expect(OWN_PERIODS.test("const PERIODS = {")).toBe(true);
  });

  it("app/ وcomponents/ مافيهمش ولا تعريف فترات", () => {
    const offenders = files.filter((f) => OWN_PERIODS.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

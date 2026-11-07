import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERIOD,
  periodHref,
  previousPeriod,
  resolvePeriod,
  shiftDays,
} from "./periods";

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

  it("الشهر ده — من يوم ١ لآخر يوم في الشهر", () => {
    const r = resolvePeriod({ period: "month" }, { today, defaultKey: "30d" });
    expect(r).toMatchObject({
      key: "month",
      start: "2026-09-01",
      end: "2026-09-30",
      days: 30,
    });
  });

  it("وآخر يوم بيتحسب صح في فبراير والشهور الناقصة", () => {
    const end = (today: string) =>
      resolvePeriod({ period: "month" }, { today, defaultKey: "30d" }).end;
    expect(end("2026-02-10")).toBe("2026-02-28");
    expect(end("2028-02-10")).toBe("2028-02-29"); // سنة كبيسة
    expect(end("2026-12-01")).toBe("2026-12-31");
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

  it("النهارده اختيار ثابت — يوم واحد", () => {
    expect(resolvePeriod({ period: "today" }, { today, defaultKey: "30d" })).toMatchObject({
      key: "today",
      start: today,
      end: today,
      days: 1,
      label: "النهارده",
    });
  });

  it("⚠️ اللينكات القديمة: week ← ٧ أيام · 3m/year ← الافتراضي", () => {
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

// كل ملفات app/ وcomponents/ — الحرّاس تحت بيمشوا على نفس القايمة
const sourceFiles: string[] = [];
{
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts"))
        sourceFiles.push(p);
    }
  };
  walk(join(process.cwd(), "app"));
  walk(join(process.cwd(), "components"));
}

describe("⚠️ مفيش صفحة بتعرّف فتراتها بنفسها", () => {

  const OWN_PERIODS = /const\s+\w*PERIODS\s*[:=]/;

  it("الحارس نفسه بيمسك التعريف", () => {
    expect(OWN_PERIODS.test('const ORDER_PERIODS: Record<string, string> = {')).toBe(true);
    expect(OWN_PERIODS.test("const PERIODS = {")).toBe(true);
  });

  it("app/ وcomponents/ مافيهمش ولا تعريف فترات", () => {
    const offenders = sourceFiles.filter((f) => OWN_PERIODS.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("previousPeriod", () => {
  const r = (period: string, extra: { from?: string; to?: string } = {}) =>
    resolvePeriod({ period, ...extra }, { today, defaultKey: "30d", allowAll: true });

  it("آخر ٣٠ يوم ← الـ٣٠ اللي قبلها بالظبط من غير تداخل", () => {
    expect(previousPeriod(r("30d"))).toMatchObject({ start: "2026-07-18", end: "2026-08-16" });
  });

  it("النهارده ← امبارح", () => {
    expect(previousPeriod(r("today"))).toMatchObject({ start: "2026-09-14", end: "2026-09-14", label: "امبارح" });
  });

  it("آخر ٧ أيام", () => {
    expect(previousPeriod(r("7d"))).toMatchObject({ start: "2026-09-02", end: "2026-09-08" });
  });

  it("الشهر ده ← الشهر اللي فات كامل", () => {
    expect(previousPeriod(r("month"))).toMatchObject({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("الشهر اللي فات أقصر — بياخد آخره هو مش ٣١", () => {
    const march = resolvePeriod({ period: "month" }, { today: "2026-03-15", defaultKey: "30d" });
    expect(previousPeriod(march)).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("مدة مخصصة ← نفس الطول قبلها", () => {
    expect(previousPeriod(r("", { from: "2026-09-01", to: "2026-09-10" }))).toMatchObject({
      start: "2026-08-22",
      end: "2026-08-31",
    });
  });

  it("كل الوقت مالهاش قبل", () => {
    expect(previousPeriod(r("all"))).toBeNull();
  });
});

// ==========================================================================
// ⚠️ الداشبورد بتتحسب في مكانين — ولازم يفضلوا على نفس الفترة
// --------------------------------------------------------------------------
// السيرفر في `app/(dashboard)/page.tsx`، وكروت الفلوس الحيّة في
// `components/LiveMoneyCards.tsx` اللي بتعيد الحساب في المتصفح. كانوا
// مكتوبين بإيد والتعليق بس هو اللي رابطهم — فأي تغيير في واحد بيخلّي نفس
// الشاشة توري رقمين مختلفين لنفس الحاجة.
// ==========================================================================
describe("الفترة الافتراضية", () => {
  /*
    ⚠️ `defaultKey: "all"` مستثنى بقصد — دي مش «فترة إحصائيات»، دي قايمة
    بتفتح على كل حاجة (صفحة الأوردرات). الممنوع هو إن صفحة تكتب فترة
    زمنية بإيدها وتفضل ورا الباقي لما الافتراضي يتغيّر.
  */
  it("⚠️ مفيش ولا صفحة كاتبة فترتها الافتراضية بإيدها", () => {
    const offenders = sourceFiles.filter((f) =>
      /defaultKey:\s*"(today|7d|30d|month)"/.test(readFileSync(f, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("الداشبورد بمكانيها الاتنين على الثابت", () => {
    // ⚠️ بتتحسب في السيرفر وفي المتصفح — لو افترقوا، نفس الشاشة بتوري
    // رقمين مختلفين لنفس الحاجة
    for (const f of ["app/(dashboard)/page.tsx", "components/LiveMoneyCards.tsx"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8")).toContain(
        "DEFAULT_PERIOD"
      );
    }
  });

  it("الافتراضي «الشهر ده» — من يوم ١ لآخر يوم في الشهر", () => {
    expect(DEFAULT_PERIOD).toBe("month");
    const r = resolvePeriod({}, { today, defaultKey: DEFAULT_PERIOD });
    expect(r).toMatchObject({
      key: "month",
      start: "2026-09-01",
      end: "2026-09-30",
      days: 30,
    });
  });

  it("والمقارنة بالشهر اللي فات كامل", () => {
    const prev = previousPeriod(
      resolvePeriod({}, { today, defaultKey: DEFAULT_PERIOD })
    );
    expect(prev).toMatchObject({ start: "2026-08-01", end: "2026-08-31" });
  });
});

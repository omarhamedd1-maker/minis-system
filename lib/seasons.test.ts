import { describe, it, expect } from "vitest";
import {
  upcomingSeasons,
  seasonAlerts,
  seasonMessage,
  lastKnownSeason,
  NOTICE_DAYS,
} from "./seasons";

/** يوم بتوقيت مصر — الظهر عشان التوقيت مايزحلقش اليوم */
const at = (day: string) => new Date(`${day}T09:00:00Z`);

describe("المواسم", () => {
  it("بينبّه قبل الموسم بشهر", () => {
    // دخول المدارس ٢٠ سبتمبر ٢٠٢٦ — ناقص ٣٠ يوم = ٢١ أغسطس
    const alerts = seasonAlerts(at("2026-08-21"));
    expect(alerts.map((a) => a.season.key)).toContain("back-to-school-2026");
  });

  it("وبينبّه تاني قبله بأسبوع", () => {
    const alerts = seasonAlerts(at("2026-09-13"));
    expect(alerts.map((a) => a.season.key)).toContain("back-to-school-2026");
    expect(alerts[0].daysAway).toBe(7);
  });

  it("⚠️ الشباك يوم قبل ويوم بعد — الكرون لو اتأخر التنبيه مايضيعش", () => {
    for (const day of ["2026-08-20", "2026-08-21", "2026-08-22"]) {
      expect(
        seasonAlerts(at(day)).map((a) => a.season.key)
      ).toContain("back-to-school-2026");
    }
  });

  it("⚠️ اليوم العادي مافيهوش تنبيه", () => {
    expect(seasonAlerts(at("2026-08-25"))).toEqual([]);
  });

  it("⚠️ يوم الموسم نفسه مافيهوش تنبيه — فات وقت التجهيز", () => {
    expect(
      seasonAlerts(at("2026-09-20")).map((a) => a.season.key)
    ).not.toContain("back-to-school-2026");
  });

  it("المواسم الجاية مرتّبة بالأقرب", () => {
    const list = upcomingSeasons(at("2026-11-01"), 90);
    expect(list[0].key).toBe("black-friday-2026");
    expect(list.map((s) => s.daysAway)).toEqual(
      [...list.map((s) => s.daysAway)].sort((a, b) => a - b)
    );
  });

  it("⚠️ اللي عدّى مايظهرش", () => {
    const list = upcomingSeasons(at("2026-12-05"), 90);
    expect(list.map((s) => s.key)).not.toContain("black-friday-2026");
    expect(list.every((s) => s.daysAway >= 0)).toBe(true);
  });

  it("المدة بتتحترم", () => {
    expect(upcomingSeasons(at("2026-08-20"), 7)).toEqual([]);
    expect(upcomingSeasons(at("2026-08-20"), 45).length).toBeGreaterThan(0);
  });

  it("⚠️⚠️ رمضان بيتقدّم كل سنة — مش تاريخ ثابت", () => {
    const r26 = upcomingSeasons(at("2027-01-01"), 400).find(
      (s) => s.key === "ramadan-2027"
    );
    expect(r26?.date).toBe("2027-02-08");
    // العيد بعده بشهر تقريبًا مش بعد سنة
    const eid = upcomingSeasons(at("2027-01-01"), 400).find(
      (s) => s.key === "eid-fitr-2027"
    );
    expect(eid?.date).toBe("2027-03-10");
  });

  it("⚠️ بعد آخر موسم مكتوب الملف بيسكت — مابيخترعش تواريخ", () => {
    const after = new Date(`${lastKnownSeason()}T09:00:00Z`);
    after.setUTCFullYear(after.getUTCFullYear() + 1);
    expect(seasonAlerts(after)).toEqual([]);
    expect(upcomingSeasons(after, 365)).toEqual([]);
  });

  it("⚠️ الرسالة بتقول الموسم ومعناه من غير ما تقول اعمل إيه", () => {
    const [a] = seasonAlerts(at("2026-08-21"));
    const text = seasonMessage(a.season, a.daysAway);
    expect(text).toContain("دخول المدارس");
    expect(text).toContain("30");
    expect(text).not.toContain("لازم");
    expect(text).not.toContain("اطلب");
  });

  it("«بكرة» بدل «فاضل يوم»", () => {
    expect(seasonMessage({ key: "x", name: "الموسم", date: "2026-01-01", note: "n" }, 1)).toContain(
      "بكرة"
    );
  });

  it("التنبيهين بس — شهر وأسبوع", () => {
    expect([...NOTICE_DAYS]).toEqual([30, 7]);
  });
});

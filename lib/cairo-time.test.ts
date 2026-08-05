import { describe, expect, it } from "vitest";
import {
  cairoInputToUtc,
  cairoOffsetMinutes,
  utcToCairoInput,
} from "./cairo-time";

describe("فرق القاهرة عن التوقيت العالمي", () => {
  // **مش ثابت** — مصر رجّعت التوقيت الصيفي من ٢٠٢٣
  it("الصيف +٣ والشتا +٢", () => {
    expect(cairoOffsetMinutes(new Date("2026-08-10T12:00:00Z"))).toBe(180);
    expect(cairoOffsetMinutes(new Date("2026-01-10T12:00:00Z"))).toBe(120);
  });
});

describe("اللي المستخدم بيكتبه ← اللي بيتخزّن", () => {
  it("٢:٣٠ بتوقيت مصر في أغسطس = ١١:٣٠ عالمي", () => {
    expect(cairoInputToUtc("2026-08-10T14:30")).toBe("2026-08-10T11:30:00.000Z");
  });

  it("**ونفس الوقت في يناير = ١٢:٣٠** لأن الفرق اتغيّر", () => {
    expect(cairoInputToUtc("2026-01-10T14:30")).toBe("2026-01-10T12:30:00.000Z");
  });

  it("الفاضي والبايظ بيرجعوا null مش تاريخ غلط", () => {
    expect(cairoInputToUtc("")).toBe(null);
    expect(cairoInputToUtc("2026-08-10")).toBe(null);
    expect(cairoInputToUtc("مش تاريخ")).toBe(null);
  });
});

describe("الرجوع — الخانة بتفتح على القيمة المحفوظة", () => {
  it("بيرجّع نفس اللي اتكتب", () => {
    for (const local of ["2026-08-10T14:30", "2026-01-10T09:05"]) {
      expect(utcToCairoInput(cairoInputToUtc(local))).toBe(local);
    }
  });

  it("الفاضي بيفضل فاضي", () => {
    expect(utcToCairoInput(null)).toBe("");
    expect(utcToCairoInput("مش تاريخ")).toBe("");
  });
});

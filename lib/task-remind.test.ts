import { describe, expect, it } from "vitest";
import {
  MAX_REMINDERS,
  dueForReminder,
  nextRemindAt,
  reminderLabel,
  reminderSkipReason,
  reminderStep,
} from "./task-remind";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const PAST = "2026-08-10T11:00:00.000Z";
const FUTURE = "2026-08-10T13:00:00.000Z";

const t = (over: Partial<Parameters<typeof dueForReminder>[0][number]> = {}) => ({
  id: "a",
  status: "open" as string | null,
  remind_at: PAST,
  ...over,
});

describe("قراية الفاصل", () => {
  it("متكرر صح", () => {
    expect(reminderStep({ remind_every: 3, remind_unit: "hour" })).toEqual({
      every: 3,
      unit: "hour",
    });
  });

  it("مرة واحدة = مفيش فاصل", () => {
    expect(reminderStep({ remind_every: null, remind_unit: null })).toBe(null);
  });

  it("الأرقام البايظة بترجع فاضية بدل ما نخمّن", () => {
    expect(reminderStep({ remind_every: 0, remind_unit: "hour" })).toBe(null);
    expect(reminderStep({ remind_every: -5, remind_unit: "day" })).toBe(null);
    expect(reminderStep({ remind_every: 9999, remind_unit: "day" })).toBe(null);
    expect(reminderStep({ remind_every: 2, remind_unit: "سنة" })).toBe(null);
  });
});

describe("اسم الفاصل بالعربي", () => {
  it("بيفرّق بين الواحد والاتنين والجمع", () => {
    expect(reminderLabel({ remind_every: 1, remind_unit: "hour" })).toBe("كل ساعة");
    expect(reminderLabel({ remind_every: 2, remind_unit: "day" })).toBe("كل يومين");
    expect(reminderLabel({ remind_every: 3, remind_unit: "week" })).toBe("كل 3 أسابيع");
  });

  it("مرة واحدة مالهاش اسم فاصل", () => {
    expect(reminderLabel({ remind_every: null, remind_unit: null })).toBe(null);
  });
});

describe("مين ياخد تنبيه دلوقتي", () => {
  it("**اللي خلص مابياخدش** — التنبيه بيسكت لوحده", () => {
    expect(reminderSkipReason(t({ status: "done" }), NOW)).toBe("done");
    expect(dueForReminder([t({ status: "done" })], NOW)).toHaveLength(0);
  });

  it("مالوش ميعاد؟ عدّي", () => {
    expect(reminderSkipReason(t({ remind_at: null }), NOW)).toBe("no_time");
  });

  it("ميعاده لسه ماجاش؟ استنى", () => {
    expect(reminderSkipReason(t({ remind_at: FUTURE }), NOW)).toBe("too_soon");
  });

  it("ميعاده جه؟ يتبعت", () => {
    expect(reminderSkipReason(t(), NOW)).toBe(null);
    expect(dueForReminder([t()], NOW)).toHaveLength(1);
  });

  it("تاريخ بايظ مابيقعش الدنيا", () => {
    expect(reminderSkipReason(t({ remind_at: "مش تاريخ" }), NOW)).toBe("bad_time");
  });
});

describe("التكرار لحد ما يخلص", () => {
  it("المتكرر بيحجز ميعاده الجاي", () => {
    const [d] = dueForReminder(
      [t({ remind_every: 2, remind_unit: "hour" })],
      NOW
    );
    expect(d.next).toBe("2026-08-10T14:00:00.000Z");
    expect(d.last).toBe(false);
  });

  it("**الجاي بيتحسب من دلوقتي مش من الميعاد الفايت**", () => {
    // السيرفر كان نايم ٦ ساعات على تنبيه كل ساعة — ده بيبعت واحد ويكمّل،
    // مش يبعت ٦ ورا بعض
    const [d] = dueForReminder(
      [
        t({
          remind_at: "2026-08-10T06:00:00.000Z",
          remind_every: 1,
          remind_unit: "hour",
        }),
      ],
      NOW
    );
    expect(d.next).toBe("2026-08-10T13:00:00.000Z");
  });

  it("اللي مرة واحدة مابيحجزش تاني", () => {
    const [d] = dueForReminder([t()], NOW);
    expect(d.next).toBe(null);
    expect(d.last).toBe(false);
  });

  it("**السقف بيسكّت الزنّ** — آخر واحدة وبعدين خلاص", () => {
    const [d] = dueForReminder(
      [
        t({
          remind_every: 1,
          remind_unit: "hour",
          remind_count: MAX_REMINDERS - 1,
        }),
      ],
      NOW
    );
    expect(d.next).toBe(null);
    expect(d.last).toBe(true);
  });

  it("وصل السقف؟ مابيتبعتش خالص", () => {
    expect(
      reminderSkipReason(
        t({ remind_every: 1, remind_unit: "hour", remind_count: MAX_REMINDERS }),
        NOW
      )
    ).toBe("capped");
  });
});

describe("حسبة الميعاد الجاي", () => {
  it("بالساعة وباليوم وبالأسبوع", () => {
    expect(nextRemindAt(NOW, { every: 1, unit: "hour" })).toBe(
      "2026-08-10T13:00:00.000Z"
    );
    expect(nextRemindAt(NOW, { every: 3, unit: "day" })).toBe(
      "2026-08-13T12:00:00.000Z"
    );
    expect(nextRemindAt(NOW, { every: 2, unit: "week" })).toBe(
      "2026-08-24T12:00:00.000Z"
    );
  });
});

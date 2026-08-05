// ==========================================================================
// تنبيهات التاسك — القرار بس، من غير قاعدة بيانات ولا إرسال
// --------------------------------------------------------------------------
// الفرق عن تنبيهات المزامنة: دي **بيظبطها بني آدم** على تاسك معيّن. يا إما
// مرة واحدة في وقت محدد، يا إما كل كذا **طول ما التاسك ماخلصش**.
//
// ⚠️ **والتكرار «لحد ما يخلص» ماكينة زنّ لو سِبناها**: تنبيه كل ساعة على
// تاسك اتنسي شهر = ٧٢٠ إشعار. فيه سقف (`MAX_REMINDERS`) بيسكّتها، وده نفس
// المبدأ المكتوب في `HANDOVER` عن تنبيهات المزامنة: كل مرحلة مرة واحدة.
//
// **والميعاد الجاي بيتحسب من دلوقتي مش من الميعاد الفايت** — لو السيرفر
// كان نايم ٦ ساعات على تنبيه كل ساعة، ده يبعت واحد ويحسب اللي بعده من
// دلوقتي، مش يبعت ٦ ورا بعض.
// ==========================================================================

export type ReminderUnit = "hour" | "day" | "week";

export const REMINDER_UNITS: { key: ReminderUnit; label: string; plural: string }[] =
  [
    { key: "hour", label: "ساعة", plural: "ساعات" },
    { key: "day", label: "يوم", plural: "أيام" },
    { key: "week", label: "أسبوع", plural: "أسابيع" },
  ];

/** أقصى عدد تنبيهات للتاسك الواحد قبل ما يسكت */
export const MAX_REMINDERS = 30;

/** حد أقصى للفاصل — «كل ٥٠٠ ساعة» غلطة كتابة مش نية */
export const MAX_REMIND_EVERY = 365;

const MS: Record<ReminderUnit, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

export type RemindableTask = {
  id: string;
  status: string | null;
  /** امتى التنبيه الجاي (وقت عالمي) */
  remind_at: string | null;
  /** يتكرر كل كام؟ فاضية = مرة واحدة وخلاص */
  remind_every?: number | null;
  remind_unit?: string | null;
  /** اتبعت كام مرة لحد دلوقتي */
  remind_count?: number | null;
};

/** بيرجّع الفاصل لو التنبيه متكرر، و`null` لو مرة واحدة أو الأرقام بايظة */
export function reminderStep(
  t: Pick<RemindableTask, "remind_every" | "remind_unit">
): { every: number; unit: ReminderUnit } | null {
  const every = Math.floor(Number(t.remind_every ?? 0));
  const unit = String(t.remind_unit ?? "");
  if (!Number.isFinite(every) || every < 1 || every > MAX_REMIND_EVERY) return null;
  if (!REMINDER_UNITS.some((u) => u.key === unit)) return null;
  return { every, unit: unit as ReminderUnit };
}

/** «كل ساعة» · «كل ٣ أيام» */
export function reminderLabel(
  t: Pick<RemindableTask, "remind_every" | "remind_unit">
): string | null {
  const step = reminderStep(t);
  if (!step) return null;
  const u = REMINDER_UNITS.find((x) => x.key === step.unit)!;
  if (step.every === 1) return `كل ${u.label}`;
  if (step.every === 2) return `كل ${u.label}ين`;
  return `كل ${step.every} ${u.plural}`;
}

/** الميعاد الجاي — **من دلوقتي** مش من الميعاد الفايت */
export function nextRemindAt(
  now: Date,
  step: { every: number; unit: ReminderUnit }
): string {
  return new Date(now.getTime() + step.every * MS[step.unit]).toISOString();
}

export type ReminderDecision = {
  task: RemindableTask;
  /** التنبيه اللي بعده، أو `null` يعني خلاص مفيش تاني */
  next: string | null;
  /** آخر واحد؟ (وصل السقف) — الرسالة بتقول كده */
  last: boolean;
};

export type ReminderSkip =
  | "done"
  | "no_time"
  | "too_soon"
  | "capped"
  | "bad_time";

/** ليه التاسك ده مش هياخد تنبيه دلوقتي — مفيدة في الاختبار وفي `?dry=1` */
export function reminderSkipReason(
  t: RemindableTask,
  now: Date
): ReminderSkip | null {
  // **طول ما التاسك ماتعملش** — أول ما يخلص التنبيه بيسكت لوحده
  if (t.status === "done") return "done";
  if (!t.remind_at) return "no_time";

  const at = Date.parse(t.remind_at);
  if (!Number.isFinite(at)) return "bad_time";
  if (at > now.getTime()) return "too_soon";

  if (Number(t.remind_count ?? 0) >= MAX_REMINDERS) return "capped";
  return null;
}

/** أنهي تاسكات محتاجة تنبيه دلوقتي، وإيه ميعادها الجاي */
export function dueForReminder(
  tasks: RemindableTask[],
  now: Date
): ReminderDecision[] {
  const out: ReminderDecision[] = [];

  for (const t of tasks) {
    if (reminderSkipReason(t, now)) continue;

    const step = reminderStep(t);
    const sent = Number(t.remind_count ?? 0) + 1;
    // مرة واحدة؟ مفيش جاي. متكرر ووصل السقف؟ برضه مفيش — ودي آخر واحدة
    const last = !step || sent >= MAX_REMINDERS;
    out.push({
      task: t,
      next: last ? null : nextRemindAt(now, step!),
      last: Boolean(step) && last,
    });
  }

  return out;
}

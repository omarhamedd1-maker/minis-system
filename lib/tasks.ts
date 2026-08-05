// ==========================================================================
// عقل التاسكات — دوال صافية بالكامل
// --------------------------------------------------------------------------
// الترتيب والتأخير والتقدّم كلهم هنا عشان يتختبروا من غير قاعدة بيانات ولا
// شاشة. الشاشة بترسم بس.
// ==========================================================================

export type TaskStatus = "open" | "doing" | "done";
export type TaskPriority = "urgent" | "normal";

export const TASK_STATUSES: { key: TaskStatus; label: string; className: string }[] = [
  { key: "open", label: "مفتوح", className: "bg-gray-100 text-gray-700" },
  { key: "doing", label: "شغال عليه", className: "bg-sky-100 text-sky-800" },
  { key: "done", label: "خلص", className: "bg-green-100 text-green-800" },
];

export const TASK_PRIORITIES: { key: TaskPriority; label: string }[] = [
  { key: "urgent", label: "عاجل" },
  { key: "normal", label: "عادي" },
];

export function taskStatusBadge(status: string | null | undefined) {
  return (
    TASK_STATUSES.find((s) => s.key === status) ?? {
      key: "open" as TaskStatus,
      label: String(status ?? "مفتوح"),
      className: "bg-gray-100 text-gray-600",
    }
  );
}

export type TaskLike = {
  status: string | null;
  priority: string | null;
  due_on: string | null;
  created_at?: string | null;
};

/**
 * التاسك متأخر؟ **اللي خلص عمره ما يبقى متأخر** مهما كان ميعاده فات — ده
 * كان هيخلّي نص اللوحة أحمر على شغل خلصان.
 *
 * والمقارنة بالتاريخ بس (`YYYY-MM-DD`) مش بالوقت: تاسك ميعاده النهاردة
 * مايبقاش متأخر الساعة ٩ الصبح.
 */
export function isOverdue(t: TaskLike, today: string): boolean {
  if (t.status === "done") return false;
  if (!t.due_on) return false;
  return String(t.due_on).slice(0, 10) < today;
}

/** «النهاردة» و«بكرة» أوضح من تاريخ، والباقي بيتكتب بالتاريخ */
export function dueLabel(due: string | null | undefined, today: string): string | null {
  if (!due) return null;
  const d = String(due).slice(0, 10);
  if (d === today) return "النهاردة";

  const day = 86_400_000;
  const t = Date.parse(today + "T00:00:00Z");
  const x = Date.parse(d + "T00:00:00Z");
  if (!Number.isFinite(t) || !Number.isFinite(x)) return d;

  const diff = Math.round((x - t) / day);
  if (diff === 1) return "بكرة";
  if (diff === -1) return "امبارح";
  if (diff < 0) return `متأخر ${Math.abs(diff)} يوم`;
  if (diff <= 7) return `بعد ${diff} أيام`;
  return d;
}

/**
 * ترتيب اللوحة: **اللي محتاج تحرّك فوق**.
 *
 *   المتأخر ← العاجل ← الأقرب ميعادًا ← الأقدم إنشاءً
 *
 * واللي خلص بينزل تحت خالص مهما كانت أولويته — خلاص مش محتاج حاجة.
 */
export function sortTasks<T extends TaskLike>(tasks: T[], today: string): T[] {
  const rank = (t: T) => {
    if (t.status === "done") return 3;
    if (isOverdue(t, today)) return 0;
    if (t.priority === "urgent") return 1;
    return 2;
  };

  return [...tasks].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;

    // اللي ليه ميعاد قبل اللي مالوش
    const da = a.due_on ? String(a.due_on).slice(0, 10) : "";
    const db = b.due_on ? String(b.due_on).slice(0, 10) : "";
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;

    const ca = Date.parse(String(a.created_at ?? "")) || 0;
    const cb = Date.parse(String(b.created_at ?? "")) || 0;
    return ca - cb;
  });
}

/**
 * تقسيم اللوحة لمجموعات ليها عناوين.
 *
 * القايمة الواحدة الطويلة مابتقولش لك تبدأ منين — كل التاسكات شكلها واحد
 * والفرق بينهم في سطر رمادي صغير تحت. التقسيم بيجاوب على السؤال الحقيقي:
 * **إيه اللي محتاج مني حاجة دلوقتي؟**
 *
 * والمجموعة الفاضية مابتظهرش خالص — مافيش لازمة لعنوان تحته "مفيش".
 */
export function groupTasks<T extends TaskLike & { id: string }>(
  tasks: T[],
  today: string
): { key: string; label: string; tone: "bad" | "warn" | "plain" | "muted"; items: T[] }[] {
  const sorted = sortTasks(tasks, today);

  const bucket = (t: T) => {
    if (t.status === "done") return "done";
    if (isOverdue(t, today)) return "late";
    const due = t.due_on ? String(t.due_on).slice(0, 10) : null;
    if (due && due === today) return "today";
    if (!due) return "someday";
    return "next";
  };

  const groups: { key: string; label: string; tone: "bad" | "warn" | "plain" | "muted" }[] = [
    { key: "late", label: "متأخر", tone: "bad" },
    { key: "today", label: "النهاردة", tone: "warn" },
    { key: "next", label: "جاي", tone: "plain" },
    { key: "someday", label: "من غير ميعاد", tone: "plain" },
    { key: "done", label: "خلص", tone: "muted" },
  ];

  return groups
    .map((g) => ({ ...g, items: sorted.filter((t) => bucket(t) === g.key) }))
    .filter((g) => g.items.length > 0);
}

/** تقدّم الخطوات — بيتعرض كشريط جوّه التاسك */
export function stepsProgress(
  steps: { done: boolean }[]
): { done: number; total: number; percent: number } {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/**
 * كل الخطوات خلصت؟ التاسك يبقى خلص.
 *
 * **بس مابنقفلش تاسك مالوش خطوات لوحده** — التاسك من غير خطوات بيخلص لما
 * صاحبه يقول، مش لأن صفر من صفر بيساوي مية في المية.
 */
export function allStepsDone(steps: { done: boolean }[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done);
}

// ==========================================================================
// التاسك اللي بيتكرر
// ==========================================================================

export type RepeatKind = "daily" | "weekly" | "monthly" | "custom";
export type RepeatUnit = "day" | "week" | "month";

export const REPEAT_KINDS: { key: RepeatKind; label: string }[] = [
  { key: "daily", label: "كل يوم" },
  { key: "weekly", label: "كل أسبوع" },
  { key: "monthly", label: "كل شهر" },
  { key: "custom", label: "كل كام؟" },
];

export const REPEAT_UNITS: { key: RepeatUnit; label: string; plural: string }[] = [
  { key: "day", label: "يوم", plural: "أيام" },
  { key: "week", label: "أسبوع", plural: "أسابيع" },
  { key: "month", label: "شهر", plural: "شهور" },
];

/** حد أقصى للتكرار — «كل ٥٠٠ يوم» غلطة كتابة مش نية */
export const MAX_REPEAT_EVERY = 365;

export type RepeatFields = {
  repeat_kind: string | null | undefined;
  repeat_every?: number | null;
  repeat_unit?: string | null;
};

export type RepeatStep = { every: number; unit: RepeatUnit };

/**
 * بيحوّل أي تكرار لخطوة موحّدة: **كام × وحدة**.
 *
 * الجاهزين (يومي/أسبوعي/شهري) بيتحوّلوا لـ(١ × وحدتهم)، والكاستم بيتقرا
 * من خانتين. كده الحسبة واحدة للكل بدل شرط لكل نوع، وإضافة نوع جاهز جديد
 * بقت سطر واحد.
 *
 * وبيرجّع `null` لأي حاجة مش مفهومة — التاسك ساعتها مايتكررش، وده أأمن
 * من إننا نخمّن.
 */
export function repeatStep(t: RepeatFields): RepeatStep | null {
  switch (t.repeat_kind) {
    case "daily":
      return { every: 1, unit: "day" };
    case "weekly":
      return { every: 1, unit: "week" };
    case "monthly":
      return { every: 1, unit: "month" };
    case "custom": {
      const every = Math.floor(Number(t.repeat_every ?? 0));
      const unit = String(t.repeat_unit ?? "");
      if (!Number.isFinite(every) || every < 1 || every > MAX_REPEAT_EVERY) {
        return null;
      }
      if (!REPEAT_UNITS.some((u) => u.key === unit)) return null;
      return { every, unit: unit as RepeatUnit };
    }
    default:
      return null;
  }
}

/** «كل يوم» · «كل ٣ أيام» — العربي بيفرّق بين الواحد والاتنين والجمع */
export function repeatLabel(t: RepeatFields | string | null | undefined): string | null {
  const fields: RepeatFields =
    typeof t === "string" || t == null ? { repeat_kind: t ?? null } : t;

  const step = repeatStep(fields);
  if (!step) return null;

  const u = REPEAT_UNITS.find((x) => x.key === step.unit)!;
  if (step.every === 1) return `كل ${u.label}`;
  if (step.every === 2) return `كل ${u.label}ين`;
  return `كل ${step.every} ${u.plural}`;
}

/**
 * الميعاد الجاي بعد ميعاد.
 *
 * الشهري بيمشي بالشهر مش بـ٣٠ يوم، و**اليوم اللي مش موجود بينزل لآخر يوم
 * في الشهر**: ٣١ يناير + شهر = ٢٨ فبراير مش ٣ مارس. جافاسكريبت بتلف لوحدها
 * للشهر اللي بعده وده بيخلّي تاسك آخر الشهر يهرب يوم كل شهر.
 */
export function stepDue(due: string, step: RepeatStep): string {
  const [y, m, d] = String(due).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return due;

  if (step.unit === "day" || step.unit === "week") {
    const days = step.every * (step.unit === "week" ? 7 : 1);
    const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }

  // بالشهور — بنزوّد على رقم الشهر ونقصّ اليوم لآخر يوم في الشهر الناتج
  const total = m - 1 + step.every;
  const ny = y + Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** نفس `stepDue` بس بتاخد نوع التكرار زي ما هو مخزّن */
export function nextDue(
  due: string,
  kind: RepeatKind,
  every?: number,
  unit?: RepeatUnit
): string {
  const step = repeatStep({
    repeat_kind: kind,
    repeat_every: every,
    repeat_unit: unit,
  });
  return step ? stepDue(due, step) : due;
}

export type RepeatingTask = {
  id: string;
  due_on: string | null;
  repeat_kind: string | null;
  repeat_every?: number | null;
  repeat_unit?: string | null;
  status: string | null;
};

/**
 * أنهي تاسك متكرر محتاج نسخة جديدة دلوقتي؟
 *
 * الشرطين:
 *   ١. ميعاد النسخة الجاية وصل (أو فات)
 *   ٢. **مفيش نسخة مفتوحة منه** — من غير ده التاسك اليومي اللي نسيته أسبوع
 *      بيولّد ٧ نسخ ويغرق اللوحة
 *
 * `openByFamily` = عدد النسخ المفتوحة لكل عيلة (الأصل ونسخه).
 */
export function dueForRepeat(
  tasks: RepeatingTask[],
  openByFamily: Map<string, number>,
  today: string
): { task: RepeatingTask; due: string }[] {
  const out: { task: RepeatingTask; due: string }[] = [];

  for (const t of tasks) {
    const step = repeatStep(t);
    if (!step) continue;
    // التاسك المتكرر لازم يبقى ليه ميعاد — من غيره مفيش معنى لـ"الجاي"
    if (!t.due_on) continue;
    if ((openByFamily.get(t.id) ?? 0) > 0) continue;

    const due = stepDue(String(t.due_on).slice(0, 10), step);
    if (due <= today) out.push({ task: t, due });
  }

  return out;
}

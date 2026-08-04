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

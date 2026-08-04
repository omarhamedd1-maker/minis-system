import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { cairoToday } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import { dueLabel, isOverdue, sortTasks, taskStatusBadge } from "@/lib/tasks";
import { AddTask } from "@/components/AddTask";
import { createTask, setTaskStatus } from "./actions";

type TaskRow = {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_on: string | null;
  created_at: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  order_id: string | null;
  task_steps: { done: boolean }[];
};

/** الفلاتر اللي فوق — «اللي عليّا» الافتراضي لأنه أهم سؤال للموظف */
const VIEWS = [
  { key: "mine", label: "اللي عليّا" },
  { key: "open", label: "الشغال" },
  { key: "all", label: "الكل" },
] as const;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; error?: string }>;
}) {
  const { view: rawView, error: actionError } = await searchParams;
  const user = await requirePagePermission("tasks.view");
  const canEdit = can(user, "tasks.edit");
  const canAssign = can(user, "tasks.assign");
  const db = createAdminClient();
  const today = cairoToday();

  const view = VIEWS.some((v) => v.key === rawView) ? rawView! : "mine";

  const { data, error } = await db
    .from("tasks")
    .select(
      "id, title, status, priority, due_on, created_at, assignee_id, assignee_name, order_id, task_steps(done)"
    )
    .eq("tenant_id", user.tenantId)
    .limit(500)
    .overrideTypes<TaskRow[]>();

  // الجداول لسه ماتعملتش
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">التاسكات</h1>
        <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">الشاشة محتاجة جداولها في قاعدة البيانات الأول.</p>
          <p className="mt-1">
            افتح سوبابيز ← SQL Editor وشغّل <code>sql/tasks.sql</code>، وبعدين
            افتح الصفحة تاني.
          </p>
          <p className="mt-2 text-xs text-amber-700">({error.message})</p>
        </div>
      </div>
    );
  }

  const all = data ?? [];
  const mine = all.filter((t) => t.assignee_id === user.authUserId);

  const shown = sortTasks(
    view === "mine" ? mine : view === "open" ? all.filter((t) => t.status !== "done") : all,
    today
  );

  const overdueCount = all.filter((t) => isOverdue(t, today)).length;

  // قايمة التيم للإسناد
  const { data: team } = await db
    .from("app_users")
    .select("id, full_name")
    .eq("tenant_id", user.tenantId)
    .eq("active", true)
    .order("full_name");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold text-gray-900">التاسكات</h1>
          <span className="text-sm text-gray-500">{shown.length}</span>
          {overdueCount > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              {overdueCount} متأخر
            </span>
          )}
        </div>
        {canEdit && (
          <AddTask
            team={((team ?? []) as { id: string; full_name: string | null }[]).map((u) => ({
              id: u.id,
              name: u.full_name ?? "بدون اسم",
            }))}
            canAssign={canAssign}
            action={createTask}
          />
        )}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/tasks?view=${v.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              view === v.key
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            {v.label}
            {v.key === "mine" && mine.length > 0 && ` (${mine.length})`}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
          {view === "mine" ? "مفيش تاسكات عليك — تمام" : "مفيش تاسكات هنا"}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) => {
            const badge = taskStatusBadge(t.status);
            const late = isOverdue(t, today);
            const due = dueLabel(t.due_on, today);
            const steps = t.task_steps ?? [];
            const doneSteps = steps.filter((s) => s.done).length;

            return (
              <li
                key={t.id}
                className={`rounded-xl bg-white p-3 shadow-sm ${
                  late ? "border-r-4 border-red-400" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.priority === "urgent" && t.status !== "done" && (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          عاجل
                        </span>
                      )}
                      <span
                        className={`text-sm font-medium ${
                          t.status === "done"
                            ? "text-gray-400 line-through"
                            : "text-gray-900"
                        }`}
                      >
                        {t.title}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className={`rounded-full px-2 py-0.5 ${badge.className}`}>
                        {badge.label}
                      </span>
                      {t.assignee_name && <span>{t.assignee_name}</span>}
                      {due && (
                        <span className={late ? "font-medium text-red-600" : ""}>
                          {due}
                        </span>
                      )}
                      {steps.length > 0 && (
                        <span>
                          خطوات {doneSteps}/{steps.length}
                        </span>
                      )}
                      {t.order_id && (
                        <span className="text-sky-600">مربوط بأوردر</span>
                      )}
                    </div>
                  </Link>

                  {canEdit && t.status !== "done" && (
                    <form action={setTaskStatus} className="shrink-0">
                      <input type="hidden" name="task_id" value={t.id} />
                      <input type="hidden" name="status" value="done" />
                      <input type="hidden" name="return_to" value={`/tasks?view=${view}`} />
                      <button
                        type="submit"
                        title="علّم إنه خلص"
                        aria-label="علّم إنه خلص"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

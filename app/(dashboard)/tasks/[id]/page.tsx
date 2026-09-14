import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { cairoToday, formatDate } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import {
  TASK_PRIORITIES,
  dueLabel,
  isOverdue,
  repeatLabel,
  stepsProgress,
  taskStatusBadge,
} from "@/lib/tasks";
import { reminderLabel } from "@/lib/task-remind";
import { cairoTimeText, utcToCairoInput } from "@/lib/cairo-time";
import type { TaskFile } from "@/lib/task-files";
import { BackLink } from "@/components/BackLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TaskSchedule } from "@/components/TaskSchedule";
import {
  addStep,
  addTaskComment,
  assignTask,
  deleteStep,
  deleteTask,
  setTaskStatus,
  toggleStep,
  updateTask,
  uploadTaskFile,
  deleteTaskFile,
} from "../actions";

type TaskDetail = {
  id: string;
  title: string;
  body: string | null;
  status: string | null;
  priority: string | null;
  due_on: string | null;
  created_at: string | null;
  created_by: string | null;
  done_at: string | null;
  done_by: string | null;
  task_assignees: { user_id: string; user_name: string | null }[];
  order_id: string | null;
  repeat_kind: string | null;
  repeat_every: number | null;
  repeat_unit: string | null;
  remind_at: string | null;
  remind_every: number | null;
  remind_unit: string | null;
  repeat_parent_id: string | null;
  attachments: unknown;
  task_steps: { id: string; title: string; done: boolean; position: number }[];
  task_comments: { id: string; author_name: string; body: string; created_at: string }[];
};

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const user = await requirePagePermission("tasks.view");
  const canEdit = can(user, "tasks.edit");
  const canAssign = can(user, "tasks.assign");
  const canDelete = can(user, "tasks.delete");
  const db = createAdminClient();
  const today = cairoToday();

  const { data, error } = await db
    .from("tasks")
    .select(
      `id, title, body, status, priority, due_on, created_at, created_by, done_at, done_by,
       order_id, repeat_kind, repeat_every, repeat_unit, repeat_parent_id, attachments,
       remind_at, remind_every, remind_unit,
       task_assignees(user_id, user_name),
       task_steps(id, title, done, position),
       task_comments(id, author_name, body, created_at)`
    )
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .maybeSingle()
    .overrideTypes<TaskDetail>();

  if (error || !data) notFound();
  const task = data;

  const steps = [...(task.task_steps ?? [])].sort((a, b) => a.position - b.position);
  const comments = [...(task.task_comments ?? [])].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  );
  const progress = stepsProgress(steps);
  const badge = taskStatusBadge(task.status);
  const late = isOverdue(task, today);
  const due = dueLabel(task.due_on, today);

  const { data: team } = await db
    .from("app_users")
    .select("id, full_name")
    .eq("tenant_id", user.tenantId)
    .eq("active", true)
    .order("full_name");

  const members = (team ?? []) as { id: string; full_name: string | null }[];
  const assignees = task.task_assignees ?? [];
  const assignedIds = new Set(assignees.map((a) => a.user_id));

  // **روابط موقّتة بس** — الـbucket مقفول عشان صورة إثبات ممكن يبقى فيها
  // عنوان عميل أو فاتورة. ساعة كفاية إنك تفتح وتشوف.
  const files = await Promise.all(
    ((task.attachments ?? []) as TaskFile[]).map(async (f) => {
      try {
        const { data: signed } = await db.storage
          .from("task-files")
          .createSignedUrl(f.path, 3600);
        return { ...f, url: signed?.signedUrl ?? null };
      } catch {
        return { ...f, url: null };
      }
    })
  );

  const done = task.status === "done";

  return (
    <div className="space-y-3">
      <BackLink href="/tasks" label="الرجوع للتاسكات" variant="exit" />

      {actionError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}

      {/* ===== الرأس: الدايرة والعنوان وكل حاجة عنه في مكان واحد =====
          كان ٣ كروت منفصلة (حالة + تفاصيل + أزرار الحالة) فوق بعض، وكل
          واحد بيقول تلت الحكاية. */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          {canEdit ? (
            <form action={setTaskStatus} className="shrink-0 pt-1">
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="status" value={done ? "open" : "done"} />
              <input type="hidden" name="return_to" value={`/tasks/${task.id}`} />
              <button
                type="submit"
                title={done ? "رجّعه مفتوح" : "علّم إنه خلص"}
                aria-label={done ? "رجّعه مفتوح" : "علّم إنه خلص"}
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
                  done
                    ? "border-success bg-success text-white"
                    : "border-line-strong text-transparent hover:border-success hover:text-success"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
            </form>
          ) : (
            <span
              className={`mt-1 h-6 w-6 shrink-0 rounded-full border-2 ${
                done ? "border-success bg-success" : "border-line"
              }`}
            />
          )}

          <div className="min-w-0 flex-1">
            <h1
              className={`text-lg font-bold ${
                done ? "text-ink-faint line-through" : "text-ink"
              }`}
            >
              {task.title}
            </h1>

            {/* سطر واحد فيه كل اللي تعرفه عن التاسك */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              {task.priority === "urgent" && !done && (
                <span className="font-bold text-danger">عاجل</span>
              )}
              {task.status === "doing" && (
                <span className={`rounded-full px-2 py-0.5 ${badge.className}`}>
                  {badge.label}
                </span>
              )}
              {due && !done && (
                <span className={late ? "font-medium text-danger" : ""}>{due}</span>
              )}
              {assignees.length > 0 && (
                <span>
                  على {assignees.map((a) => a.user_name).filter(Boolean).join("، ")}
                </span>
              )}
              {repeatLabel(task) && (
                <span className="text-info">بيتكرر {repeatLabel(task)}</span>
              )}
              {/* التنبيه المحجوز — بيختفي أول ما التاسك يخلص لأنه بيسكت */}
              {task.remind_at && !done && (
                <span className="text-warning">
                  ⏰ {cairoTimeText(task.remind_at)}
                  {reminderLabel(task) ? ` · ${reminderLabel(task)}` : ""}
                </span>
              )}
              {task.order_id && (
                <Link
                  href={`/orders/${task.order_id}`}
                  className="font-medium text-info underline"
                >
                  افتح الأوردر
                </Link>
              )}
            </div>

            {task.body && (
              <p className="mt-2.5 text-sm whitespace-pre-wrap text-ink-body">
                {task.body}
              </p>
            )}
          </div>

          {/* «شغال عليه» زرار واحد بيتبدّل — كانت كل الحالات معروضة كأزرار */}
          {canEdit && !done && (
            <form action={setTaskStatus} className="shrink-0">
              <input type="hidden" name="task_id" value={task.id} />
              <input
                type="hidden"
                name="status"
                value={task.status === "doing" ? "open" : "doing"}
              />
              <input type="hidden" name="return_to" value={`/tasks/${task.id}`} />
              <button
                type="submit"
                className={`rounded-control px-2.5 py-1 text-xs font-medium ${
                  task.status === "doing"
                    ? "bg-info-soft text-info hover:bg-info-line"
                    : "bg-sunken text-ink-body hover:bg-line"
                }`}
              >
                {task.status === "doing" ? "وقّفته" : "شغال عليه"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ===== الخطوات ===== */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">الخطوات</h2>
          {progress.total > 0 && (
            <span className="text-xs text-ink-muted">
              {progress.done} من {progress.total}
            </span>
          )}
        </div>

        {progress.total > 0 && (
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        )}

        <ul className="space-y-1.5">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-control bg-sunken px-2.5 py-2">
              {canEdit ? (
                <form action={toggleStep} className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="hidden" name="task_id" value={task.id} />
                  <input type="hidden" name="step_id" value={s.id} />
                  <button
                    type="submit"
                    aria-label={s.done ? "شيل العلامة" : "علّم إنها خلصت"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      s.done
                        ? "border-success bg-success text-white"
                        : "border-line-strong bg-surface"
                    }`}
                  >
                    {s.done && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        className="h-3 w-3"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`min-w-0 flex-1 truncate text-xs ${
                      s.done ? "text-ink-faint line-through" : "text-ink-body"
                    }`}
                  >
                    {s.title}
                  </span>
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs text-ink-body">
                  {s.done ? "✓ " : ""}
                  {s.title}
                </span>
              )}

              {canEdit && (
                <form action={deleteStep}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <input type="hidden" name="step_id" value={s.id} />
                  <button
                    type="submit"
                    aria-label="امسح الخطوة"
                    className="text-xs text-ink-faint hover:text-danger"
                  >
                    ✕
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <form action={addStep} className="mt-2 flex gap-2">
            <input type="hidden" name="task_id" value={task.id} />
            <input
              name="step_title"
              required
              placeholder="خطوة جديدة"
              className="min-w-0 flex-1 rounded-control border border-line-strong px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-white"
            >
              أضف
            </button>
          </form>
        )}

        {steps.length > 0 && (
          <p className="mt-2 text-[10px] text-ink-faint">
            أول ما كل الخطوات تتعلّم، التاسك بيقفل لوحده.
          </p>
        )}
      </div>

      {/* ===== المرفقات — مطوية، بتتفتح لما تحتاجها =====
          كانت كارت مفتوح بخانة رفع ملفات وسطر شروط، وأغلب التاسكات مالهاش
          مرفقات أصلاً — يعني مساحة شاشة بتتاخد عشان تقول «مفيش». */}
      <details className="card group" open={files.length > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 text-ink-faint transition-transform group-open:rotate-90 rtl:-rotate-180 rtl:group-open:-rotate-90"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <h2 className="text-sm font-bold text-ink">
            المرفقات{files.length > 0 ? ` (${files.length})` : ""}
          </h2>
        </summary>
        <div className="px-4 pb-4">
        {files.length === 0 ? (
          <p className="text-xs text-ink-faint">مفيش مرفقات</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li
                key={f.path}
                className="flex items-center gap-2 rounded-control bg-sunken px-2.5 py-2"
              >
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-xs text-info underline"
                  >
                    {f.name}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">
                    {f.name} (الرابط مش متاح)
                  </span>
                )}
                {canEdit && (
                  <form action={deleteTaskFile}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="path" value={f.path} />
                    <button
                      type="submit"
                      aria-label="امسح المرفق"
                      className="text-xs text-ink-faint hover:text-danger"
                    >
                      ✕
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form action={uploadTaskFile} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="task_id" value={task.id} />
            <input
              type="file"
              name="file"
              required
              accept="image/*,application/pdf"
              className="min-w-0 flex-1 text-xs text-ink-muted file:me-2 file:rounded-control file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-xs file:text-ink-body"
            />
            <button
              type="submit"
              className="shrink-0 rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-white"
            >
              ارفع
            </button>
          </form>
        )}
        <p className="mt-1 text-[10px] text-ink-faint">
          صور وPDF بس، وأقصى حجم ٨ ميجا. الروابط موقّتة بساعة.
        </p>
        </div>
      </details>

      {/* ===== التعليقات ===== */}
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-bold text-ink">التعليقات</h2>
        {comments.length === 0 ? (
          <p className="text-xs text-ink-faint">مفيش تعليقات لسه</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-control bg-sunken px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-ink-body">{c.author_name}</span>
                  <span className="text-[10px] text-ink-faint">{formatDate(c.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs whitespace-pre-wrap text-ink-body">{c.body}</p>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form action={addTaskComment} className="mt-2 flex gap-2">
            <input type="hidden" name="task_id" value={task.id} />
            <input
              name="body"
              required
              placeholder="اكتب تعليق"
              className="min-w-0 flex-1 rounded-control border border-line-strong px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-white"
            >
              أضف
            </button>
          </form>
        )}
      </div>

      {/* ===== التعديل — مطوي =====
          كان أطول كارت في الصفحة ومفتوح على طول: مربعات كل التيم، وعنوان،
          وتفاصيل، وميعاد، وتكرار، وأولوية، وزرار مسح أحمر. وأنت بتفتح
          التاسك عشان **تشتغل** عليه مش عشان تعدّله. */}
      {canEdit && (
        <details className="card group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-ink-faint transition-transform group-open:rotate-90 rtl:-rotate-180 rtl:group-open:-rotate-90"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            <h2 className="text-sm font-bold text-ink">
              تعديل{canAssign ? " وإسناد" : ""}
            </h2>
          </summary>
          <div className="px-4 pb-4">

          {canAssign && (
            <form action={assignTask} className="mb-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="task_id" value={task.id} />
              {/* مربعات مش قايمة — الاختيار المتعدد بقايمة صعب على التليفون */}
              <fieldset className="min-w-40 flex-1">
                <legend className="text-[11px] text-ink-muted">
                  مين عليه التاسك
                  <span className="text-ink-faint"> (تقدر تختار أكتر من واحد)</span>
                </legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-control bg-sunken px-2.5 py-1.5 text-xs text-ink-body has-checked:bg-primary has-checked:text-white"
                    >
                      <input
                        type="checkbox"
                        name="assignee_id"
                        value={m.id}
                        defaultChecked={assignedIds.has(m.id)}
                        className="h-3.5 w-3.5"
                      />
                      {m.full_name ?? "بدون اسم"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                type="submit"
                className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-white"
              >
                اسند
              </button>
            </form>
          )}

          <form action={updateTask} className="space-y-2">
            <input type="hidden" name="task_id" value={task.id} />
            <input
              name="title"
              defaultValue={task.title}
              className="w-full rounded-control border border-line-strong px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <textarea
              name="body"
              rows={2}
              defaultValue={task.body ?? ""}
              placeholder="تفاصيل"
              className="w-full rounded-control border border-line-strong px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            />
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-ink-muted">
                الميعاد
                <input
                  name="due_on"
                  type="date"
                  defaultValue={task.due_on ?? ""}
                  className="mt-1 block rounded-control border border-line-strong px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                />
              </label>
              <label className="text-[11px] text-ink-muted">
                الأولوية
                <select
                  name="priority"
                  defaultValue={task.priority ?? "normal"}
                  className="mt-1 block rounded-control border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <TaskSchedule
              repeatKind={task.repeat_kind}
              repeatEvery={task.repeat_every}
              repeatUnit={task.repeat_unit}
              remindAt={utcToCairoInput(task.remind_at)}
              remindEvery={task.remind_every}
              remindUnit={task.remind_unit}
              hasAssignee={assignees.length > 0}
            />

            <button
              type="submit"
              className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-white"
            >
              حفظ
            </button>
          </form>

          {canDelete && (
            <form action={deleteTask} className="mt-3 border-t border-line pt-3">
              <input type="hidden" name="task_id" value={task.id} />
              <ConfirmButton
                message="تمسح التاسك ده وكل خطواته وتعليقاته؟"
                className="rounded-control bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger"
              >
                امسح التاسك
              </ConfirmButton>
            </form>
          )}
          </div>
        </details>
      )}

      <p className="text-[10px] text-ink-faint">
        اتعمل {task.created_by ? `بواسطة ${task.created_by} ` : ""}
        {formatDate(task.created_at)}
        {task.done_at && ` · خلص ${task.done_by ? `بواسطة ${task.done_by} ` : ""}${formatDate(task.done_at)}`}
      </p>
    </div>
  );
}

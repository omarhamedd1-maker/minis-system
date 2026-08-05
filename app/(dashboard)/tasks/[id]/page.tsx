import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { cairoToday, formatDate } from "@/lib/format";
import { can, requirePagePermission } from "@/lib/permissions";
import {
  REPEAT_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  dueLabel,
  isOverdue,
  repeatLabel,
  stepsProgress,
  taskStatusBadge,
} from "@/lib/tasks";
import type { TaskFile } from "@/lib/task-files";
import { BackLink } from "@/components/BackLink";
import { ConfirmButton } from "@/components/ConfirmButton";
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
       order_id, repeat_kind, repeat_parent_id, attachments,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-lg font-bold text-gray-900">{task.title}</h1>
        <BackLink href="/tasks" label="الرجوع للتاسكات" variant="exit" />
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* الحالة والميعاد والمسؤول */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow-sm">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
        {task.priority === "urgent" && task.status !== "done" && (
          <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
            عاجل
          </span>
        )}
        {due && (
          <span className={`text-xs ${late ? "font-medium text-red-600" : "text-gray-500"}`}>
            {due}
          </span>
        )}
        {assignees.length > 0 && (
          <span className="text-xs text-gray-600">
            على {assignees.map((a) => a.user_name).filter(Boolean).join("، ")}
          </span>
        )}
        {repeatLabel(task.repeat_kind) && (
          <span className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
            بيتكرر {repeatLabel(task.repeat_kind)}
          </span>
        )}
        {task.repeat_parent_id && (
          <span className="text-[10px] text-gray-400">نسخة من تاسك متكرر</span>
        )}
        {task.order_id && (
          <Link
            href={`/orders/${task.order_id}`}
            className="text-xs font-medium text-sky-700 underline"
          >
            افتح الأوردر
          </Link>
        )}

        {canEdit && (
          <div className="ms-auto flex flex-wrap gap-1.5">
            {TASK_STATUSES.filter((s) => s.key !== task.status).map((s) => (
              <form key={s.key} action={setTaskStatus}>
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="status" value={s.key} />
                <input type="hidden" name="return_to" value={`/tasks/${task.id}`} />
                <button
                  type="submit"
                  className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  {s.label}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>

      {task.body && (
        <div className="rounded-xl bg-white p-4 text-sm whitespace-pre-wrap text-gray-700 shadow-sm">
          {task.body}
        </div>
      )}

      {/* ===== الخطوات ===== */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">الخطوات</h2>
          {progress.total > 0 && (
            <span className="text-xs text-gray-500">
              {progress.done} من {progress.total}
            </span>
          )}
        </div>

        {progress.total > 0 && (
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        )}

        <ul className="space-y-1.5">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
              {canEdit ? (
                <form action={toggleStep} className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="hidden" name="task_id" value={task.id} />
                  <input type="hidden" name="step_id" value={s.id} />
                  <button
                    type="submit"
                    aria-label={s.done ? "شيل العلامة" : "علّم إنها خلصت"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      s.done
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-gray-300 bg-white"
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
                      s.done ? "text-gray-400 line-through" : "text-gray-800"
                    }`}
                  >
                    {s.title}
                  </span>
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs text-gray-800">
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
                    className="text-xs text-gray-300 hover:text-red-600"
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
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              أضف
            </button>
          </form>
        )}

        {steps.length > 0 && (
          <p className="mt-2 text-[10px] text-gray-400">
            أول ما كل الخطوات تتعلّم، التاسك بيقفل لوحده.
          </p>
        )}
      </div>

      {/* ===== المرفقات ===== */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">المرفقات</h2>

        {files.length === 0 ? (
          <p className="text-xs text-gray-400">مفيش مرفقات</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li
                key={f.path}
                className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2"
              >
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-xs text-sky-700 underline"
                  >
                    {f.name}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
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
                      className="text-xs text-gray-300 hover:text-red-600"
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
              className="min-w-0 flex-1 text-xs text-gray-600 file:me-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:text-gray-700"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              ارفع
            </button>
          </form>
        )}
        <p className="mt-1 text-[10px] text-gray-400">
          صور وPDF بس، وأقصى حجم ٨ ميجا. الروابط موقّتة بساعة.
        </p>
      </div>

      {/* ===== التعليقات ===== */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">التعليقات</h2>
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400">مفيش تعليقات لسه</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-gray-800">{c.author_name}</span>
                  <span className="text-[10px] text-gray-400">{formatDate(c.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs whitespace-pre-wrap text-gray-700">{c.body}</p>
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
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              أضف
            </button>
          </form>
        )}
      </div>

      {/* ===== التعديل ===== */}
      {canEdit && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">تعديل</h2>

          {canAssign && (
            <form action={assignTask} className="mb-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="task_id" value={task.id} />
              {/* مربعات مش قايمة — الاختيار المتعدد بقايمة صعب على التليفون */}
              <fieldset className="min-w-40 flex-1">
                <legend className="text-[11px] text-gray-500">
                  مين عليه التاسك
                  <span className="text-gray-400"> (تقدر تختار أكتر من واحد)</span>
                </legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 has-checked:bg-gray-900 has-checked:text-white"
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
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
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
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
            <textarea
              name="body"
              rows={2}
              defaultValue={task.body ?? ""}
              placeholder="تفاصيل"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
            />
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-gray-500">
                الميعاد
                <input
                  name="due_on"
                  type="date"
                  defaultValue={task.due_on ?? ""}
                  className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                />
              </label>
              <label className="text-[11px] text-gray-500">
                بيتكرر
                <select
                  name="repeat_kind"
                  defaultValue={task.repeat_kind ?? ""}
                  className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                >
                  <option value="">مرة واحدة</option>
                  {REPEAT_KINDS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-gray-500">
                الأولوية
                <select
                  name="priority"
                  defaultValue={task.priority ?? "normal"}
                  className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
              >
                حفظ
              </button>
            </div>
          </form>

          {canDelete && (
            <form action={deleteTask} className="mt-3 border-t border-gray-100 pt-3">
              <input type="hidden" name="task_id" value={task.id} />
              <ConfirmButton
                message="تمسح التاسك ده وكل خطواته وتعليقاته؟"
                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
              >
                امسح التاسك
              </ConfirmButton>
            </form>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-400">
        اتعمل {task.created_by ? `بواسطة ${task.created_by} ` : ""}
        {formatDate(task.created_at)}
        {task.done_at && ` · خلص ${task.done_by ? `بواسطة ${task.done_by} ` : ""}${formatDate(task.done_at)}`}
      </p>
    </div>
  );
}

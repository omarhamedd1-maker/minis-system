"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/permissions";
import { notifyAll } from "@/lib/push/notify";
import { allStepsDone } from "@/lib/tasks";

/** بنقبل القيم اللي نعرفها بس — أي حاجة تانية = مش متكرر */
function repeatKind(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "");
  return ["daily", "weekly", "monthly"].includes(s) ? s : null;
}

/** رسالة الخطأ بترجع في الرابط زي باقي الشاشات */
function back(taskId?: string, msg?: string) {
  const base = taskId ? `/tasks/${taskId}` : "/tasks";
  redirect(msg ? `${base}?error=${encodeURIComponent(msg)}` : base);
}

export async function createTask(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) back(undefined, "اكتب عنوان التاسك الأول");

  const db = createAdminClient();
  const assigneeId = String(formData.get("assignee_id") ?? "").trim() || null;

  // الاسم بيتخزّن جنب الرقم عشان لو المستخدم اتشال التاسك يفضل مفهوم
  let assigneeName: string | null = null;
  if (assigneeId) {
    const { data } = await db
      .from("app_users")
      .select("full_name")
      .eq("id", assigneeId)
      .maybeSingle();
    assigneeName = (data as { full_name: string | null } | null)?.full_name ?? null;
  }

  const { data: created, error } = await db
    .from("tasks")
    .insert({
      title,
      body: String(formData.get("body") ?? "").trim() || null,
      priority: formData.get("priority") === "urgent" ? "urgent" : "normal",
      due_on: String(formData.get("due_on") ?? "").trim() || null,
      // **المتكرر من غير ميعاد مالوش معنى** — مافيش "الجاي" من غير "الحالي"
      repeat_kind: String(formData.get("due_on") ?? "").trim()
        ? repeatKind(formData.get("repeat_kind"))
        : null,
      order_id: String(formData.get("order_id") ?? "").trim() || null,
      assignee_id: assigneeId,
      assignee_name: assigneeName,
      created_by: me.fullName ?? me.email ?? null,
      tenant_id: me.tenantId,
    })
    .select("id")
    .maybeSingle();

  if (error) back(undefined, "معرفناش نضيف التاسك: " + error.message);

  const taskId = (created as { id: string } | null)?.id;
  await logActivity(me, "task.create", `ضاف تاسك: ${title}`);

  // **الإشعار بيروح للي التاسك اتسند له.** الإرسال مايوقفش أي حاجة زي
  // باقي السيستم — لو وقع، التاسك اتعمل عادي.
  if (assigneeId) {
    await notifyAssignee(db, me.tenantId, title, assigneeName, taskId);
  }

  revalidatePath("/tasks");
  redirect(taskId ? `/tasks/${taskId}` : "/tasks");
}

/** إشعار «تاسك جديد عليك» — نفس شكل باقي الإشعارات: العنوان فوق والاسم تحته */
async function notifyAssignee(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  title: string,
  who: string | null,
  taskId?: string
) {
  try {
    await notifyAll(
      db,
      tenantId,
      [`📋 <b>تاسك جديد عليك</b>`, who ?? "", title].join("\n"),
      { tag: `task-${taskId ?? ""}`, url: taskId ? `/tasks/${taskId}` : "/tasks" }
    );
  } catch {
    // إشعار مايوصلش أهون من تاسك مايتعملش
  }
}

export async function updateTask(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) back();

  const db = createAdminClient();
  const patch: Record<string, unknown> = {};

  const title = String(formData.get("title") ?? "").trim();
  if (title) patch.title = title;
  if (formData.has("body")) patch.body = String(formData.get("body") ?? "").trim() || null;
  if (formData.has("priority")) {
    patch.priority = formData.get("priority") === "urgent" ? "urgent" : "normal";
  }
  if (formData.has("due_on")) {
    patch.due_on = String(formData.get("due_on") ?? "").trim() || null;
  }
  if (formData.has("repeat_kind")) {
    patch.repeat_kind = patch.due_on ? repeatKind(formData.get("repeat_kind")) : null;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("tasks").update(patch).eq("id", taskId);
    if (error) back(taskId, "معرفناش نحفظ: " + error.message);
    await logActivity(me, "task.edit", `عدّل تاسك ${title || taskId}`);
  }

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function setTaskStatus(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!taskId || !["open", "doing", "done"].includes(status)) back(taskId);

  const db = createAdminClient();
  const done = status === "done";
  const { error } = await db
    .from("tasks")
    .update({
      status,
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? (me.fullName ?? me.email ?? null) : null,
    })
    .eq("id", taskId);

  if (error) back(taskId, "معرفناش نغيّر الحالة: " + error.message);
  await logActivity(me, "task.status", `غيّر حالة تاسك لـ ${status}`);

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  redirect(String(formData.get("return_to") ?? "/tasks"));
}

export async function assignTask(formData: FormData) {
  const me = await requirePermission("tasks.assign");
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) back();

  const db = createAdminClient();
  const assigneeId = String(formData.get("assignee_id") ?? "").trim() || null;

  let assigneeName: string | null = null;
  if (assigneeId) {
    const { data } = await db
      .from("app_users")
      .select("full_name")
      .eq("id", assigneeId)
      .maybeSingle();
    assigneeName = (data as { full_name: string | null } | null)?.full_name ?? null;
  }

  const { data: before } = await db
    .from("tasks")
    .select("title, assignee_id")
    .eq("id", taskId)
    .maybeSingle();
  const prev = (before as { title: string; assignee_id: string | null } | null) ?? null;

  const { error } = await db
    .from("tasks")
    .update({ assignee_id: assigneeId, assignee_name: assigneeName })
    .eq("id", taskId);
  if (error) back(taskId, "معرفناش نسند التاسك: " + error.message);

  await logActivity(
    me,
    "task.assign",
    assigneeName
      ? `سند تاسك «${prev?.title ?? ""}» لـ ${assigneeName}`
      : `شال الإسناد عن تاسك «${prev?.title ?? ""}»`
  );

  // **بننبّه بس لو اتغيّر فعلًا** — مش كل حفظ
  if (assigneeId && assigneeId !== prev?.assignee_id) {
    await notifyAssignee(db, me.tenantId, prev?.title ?? "", assigneeName, taskId);
  }

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function addStep(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  const title = String(formData.get("step_title") ?? "").trim();
  if (!taskId || !title) back(taskId);

  const db = createAdminClient();
  const { count } = await db
    .from("task_steps")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId);

  const { error } = await db.from("task_steps").insert({
    task_id: taskId,
    title,
    position: count ?? 0,
    tenant_id: me.tenantId,
  });
  if (error) back(taskId, "معرفناش نضيف الخطوة: " + error.message);

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function toggleStep(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  const stepId = String(formData.get("step_id") ?? "");
  if (!taskId || !stepId) back(taskId);

  const db = createAdminClient();
  const { data } = await db
    .from("task_steps")
    .select("done")
    .eq("id", stepId)
    .maybeSingle();

  const next = !((data as { done: boolean } | null)?.done ?? false);
  await db.from("task_steps").update({ done: next }).eq("id", stepId);

  // **كل الخطوات خلصت؟ التاسك يقفل لوحده.** ده أكتر حاجة بتتنسى — الموظف
  // بيعلّم آخر خطوة والتاسك يفضل مفتوح في اللوحة.
  const { data: all } = await db
    .from("task_steps")
    .select("done")
    .eq("task_id", taskId);
  const steps = (all ?? []) as { done: boolean }[];

  if (allStepsDone(steps)) {
    await db
      .from("tasks")
      .update({
        status: "done",
        done_at: new Date().toISOString(),
        done_by: me.fullName ?? me.email ?? null,
      })
      .eq("id", taskId);
  }

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function deleteStep(formData: FormData) {
  await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  const stepId = String(formData.get("step_id") ?? "");
  if (taskId && stepId) {
    await createAdminClient().from("task_steps").delete().eq("id", stepId);
  }
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function addTaskComment(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!taskId || !body) back(taskId);

  const { error } = await createAdminClient().from("task_comments").insert({
    task_id: taskId,
    author_name: me.fullName ?? me.email ?? "مستخدم",
    body,
    tenant_id: me.tenantId,
  });
  if (error) back(taskId, "معرفناش نضيف التعليق: " + error.message);

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function deleteTask(formData: FormData) {
  const me = await requirePermission("tasks.delete");
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) back();

  const db = createAdminClient();
  const { data } = await db.from("tasks").select("title").eq("id", taskId).maybeSingle();
  const { error } = await db.from("tasks").delete().eq("id", taskId);
  if (error) back(taskId, "معرفناش نمسح التاسك: " + error.message);

  await logActivity(
    me,
    "task.delete",
    `مسح تاسك «${(data as { title: string } | null)?.title ?? ""}»`
  );
  revalidatePath("/tasks");
  redirect("/tasks");
}

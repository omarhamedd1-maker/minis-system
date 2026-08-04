"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/permissions";
import { notifyAll } from "@/lib/push/notify";
import { allStepsDone } from "@/lib/tasks";
import { checkFile, ownsFile, storagePath, type TaskFile } from "@/lib/task-files";

/**
 * بيقرا كل اللي اتختاروا من الفورم ويجيب أساميهم.
 * الفورم بيبعت `assignee_id` أكتر من مرة (multiple select)، فبناخدهم كلهم.
 */
async function readAssignees(
  db: ReturnType<typeof createAdminClient>,
  formData: FormData,
  tenantId: string
): Promise<{ user_id: string; user_name: string | null }[]> {
  const ids = [
    ...new Set(
      formData
        .getAll("assignee_id")
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (ids.length === 0) return [];

  // **بنتأكد إنهم من نفس البيزنس** — مانسندش تاسك لحد من بيزنس تاني
  const { data } = await db
    .from("app_users")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  return ((data ?? []) as { id: string; full_name: string | null }[]).map((u) => ({
    user_id: u.id,
    user_name: u.full_name,
  }));
}

/** بنقبل القيم اللي نعرفها بس — أي حاجة تانية = مش متكرر */
function repeatKind(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "");
  return ["daily", "weekly", "monthly"].includes(s) ? s : null;
}

/**
 * رسالة الخطأ بترجع في الرابط زي باقي الشاشات.
 * `never` مقصودة عشان تايب سكريبت يعرف إن الكود بعدها مابيتنفذش.
 */
function back(taskId?: string, msg?: string): never {
  const base = taskId ? `/tasks/${taskId}` : "/tasks";
  redirect(msg ? `${base}?error=${encodeURIComponent(msg)}` : base);
}

export async function createTask(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) back(undefined, "اكتب عنوان التاسك الأول");

  const db = createAdminClient();
  const people = await readAssignees(db, formData, me.tenantId);

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
      created_by: me.fullName ?? me.email ?? null,
      tenant_id: me.tenantId,
    })
    .select("id")
    .maybeSingle();

  if (error) back(undefined, "معرفناش نضيف التاسك: " + error.message);

  const taskId = (created as { id: string } | null)?.id;

  if (taskId && people.length > 0) {
    await db.from("task_assignees").insert(
      people.map((p) => ({ ...p, task_id: taskId, tenant_id: me.tenantId }))
    );
  }

  await logActivity(me, "task.create", `ضاف تاسك: ${title}`);

  // **الإشعار بيروح لكل اللي التاسك اتسند لهم.** الإرسال مايوقفش أي حاجة
  // زي باقي السيستم — لو وقع، التاسك اتعمل عادي.
  if (people.length > 0) {
    await notifyAssignee(db, me.tenantId, title, people, taskId);
  }

  revalidatePath("/tasks");
  redirect(taskId ? `/tasks/${taskId}` : "/tasks");
}

/**
 * إشعار «تاسك جديد عليك» — نفس شكل باقي الإشعارات:
 * الجملة فوق، والأسامي تحتها.
 */
async function notifyAssignee(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  title: string,
  people: { user_name: string | null }[],
  taskId?: string
) {
  const names = people
    .map((p) => p.user_name)
    .filter(Boolean)
    .join("، ");
  try {
    await notifyAll(db, tenantId, [`📋 <b>تاسك جديد عليك</b>`, names, title].join("\n"), {
      tag: `task-${taskId ?? ""}`,
      url: taskId ? `/tasks/${taskId}` : "/tasks",
    });
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
  const people = await readAssignees(db, formData, me.tenantId);

  const { data: before } = await db
    .from("tasks")
    .select("title")
    .eq("id", taskId)
    .maybeSingle();
  const title = (before as { title: string } | null)?.title ?? "";

  // مين كان مسنود قبل كده — عشان ننبّه الجداد بس
  const { data: had } = await db
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", taskId);
  const wasThere = new Set(
    ((had ?? []) as { user_id: string }[]).map((r) => r.user_id)
  );

  // بنمسح ونكتب من جديد — أبسط من الحسبة، والقايمة صغيرة
  await db.from("task_assignees").delete().eq("task_id", taskId);
  if (people.length > 0) {
    const { error } = await db.from("task_assignees").insert(
      people.map((p) => ({ ...p, task_id: taskId, tenant_id: me.tenantId }))
    );
    if (error) back(taskId, "معرفناش نسند التاسك: " + error.message);
  }

  const names = people.map((p) => p.user_name).filter(Boolean).join("، ");
  await logActivity(
    me,
    "task.assign",
    names
      ? `سند تاسك «${title}» لـ ${names}`
      : `شال الإسناد عن تاسك «${title}»`
  );

  // **بننبّه الجداد بس** — مش كل حفظ، ومش اللي كان مسنود خلاص
  const fresh = people.filter((p) => !wasThere.has(p.user_id));
  if (fresh.length > 0) {
    await notifyAssignee(db, me.tenantId, title, fresh, taskId);
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

// ==========================================================================
// المرفقات
// ==========================================================================

export async function uploadTaskFile(formData: FormData) {
  const me = await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  const file = formData.get("file");
  if (!taskId) back();
  if (!(file instanceof File)) back(taskId, "اختار ملف الأول");

  const check = checkFile({ type: file.type, size: file.size });
  if (!check.ok) back(taskId, check.error);

  const db = createAdminClient();
  const path = storagePath(me.tenantId, taskId, file.name, crypto.randomUUID());

  const { error: upErr } = await db.storage
    .from("task-files")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) back(taskId, "الرفع فشل: " + upErr.message);

  // بنقرا القايمة ونضيف عليها — الرفع نفسه خلص، فلو الحفظ وقع الملف
  // بيفضل في التخزين بس مش ظاهر (أهون من العكس)
  const { data } = await db
    .from("tasks")
    .select("attachments")
    .eq("id", taskId)
    .maybeSingle();

  const current = ((data as { attachments: TaskFile[] } | null)?.attachments ??
    []) as TaskFile[];

  const { error } = await db
    .from("tasks")
    .update({ attachments: [...current, { path, name: file.name }] })
    .eq("id", taskId);
  if (error) back(taskId, "الملف اترفع بس معرفناش نسجّله: " + error.message);

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function deleteTaskFile(formData: FormData) {
  await requirePermission("tasks.edit");
  const taskId = String(formData.get("task_id") ?? "");
  const path = String(formData.get("path") ?? "");
  if (!taskId || !path) back(taskId);

  const db = createAdminClient();
  const { data } = await db
    .from("tasks")
    .select("attachments")
    .eq("id", taskId)
    .maybeSingle();

  const current = ((data as { attachments: TaskFile[] } | null)?.attachments ??
    []) as TaskFile[];

  // **المسار لازم يكون مسجّل على التاسك ده** — مانمسحش أي مسار جاي من الفورم
  if (!ownsFile(current, path)) back(taskId, "الملف ده مش على التاسك ده");

  await db.storage.from("task-files").remove([path]);
  await db
    .from("tasks")
    .update({ attachments: current.filter((f) => f.path !== path) })
    .eq("id", taskId);

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

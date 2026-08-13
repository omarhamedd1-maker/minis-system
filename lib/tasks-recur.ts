// ==========================================================================
// مولّد التاسكات المتكررة
// --------------------------------------------------------------------------
// القرار كله في `lib/tasks.ts` (دوال صافية). الملف ده بيوصّله بقاعدة
// البيانات بس — يقرا المتكررين، يسأل مين منهم محتاج نسخة، ويعملها.
//
// وبيشتغل من مسار بيتنادى من الكرون كل شوية. لو اتنادى مليون مرة في اليوم
// النتيجة واحدة — شرط «مفيش نسخة مفتوحة» بيمنع التكرار.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { dueForRepeat, type RepeatingTask } from "./tasks";

export type RecurResult = { created: number; checked: number };

export async function generateRecurringTasks(opts: {
  db: SupabaseClient;
  tenantId: string;
  today: string;
}): Promise<RecurResult> {
  const { db, tenantId, today } = opts;
  const out: RecurResult = { created: 0, checked: 0 };

  // الأصول المتكررة بس — النسخ المولّدة مابتولّدش هي كمان
  const { data, error } = await db
    .from("tasks")
    .select(
      "id, title, body, priority, due_on, repeat_kind, repeat_every, repeat_unit, status, order_id, task_assignees(user_id, user_name)"
    )
    .eq("tenant_id", tenantId)
    .not("repeat_kind", "is", null)
    .is("repeat_parent_id", null)
    .limit(500);

  // الأعمدة لسه ماتعملتش؟ نعدّي بهدوء
  if (error || !data) return out;

  const parents = data as unknown as (RepeatingTask & {
    title: string;
    body: string | null;
    priority: string | null;
    order_id: string | null;
    task_assignees: { user_id: string; user_name: string | null }[];
  })[];
  out.checked = parents.length;
  if (parents.length === 0) return out;

  // كام نسخة مفتوحة لكل أصل؟ (الأصل نفسه بيتحسب لو لسه مفتوح)
  const openByFamily = new Map<string, number>();
  for (const p of parents) {
    if (p.status !== "done") openByFamily.set(p.id, 1);
  }

  const { data: kids } = await db
    .from("tasks")
    .select("repeat_parent_id, status")
    .eq("tenant_id", tenantId)
    .in(
      "repeat_parent_id",
      parents.map((p) => p.id)
    )
    .neq("status", "done")
    .limit(1000);

  for (const k of (kids ?? []) as { repeat_parent_id: string | null }[]) {
    if (!k.repeat_parent_id) continue;
    openByFamily.set(
      k.repeat_parent_id,
      (openByFamily.get(k.repeat_parent_id) ?? 0) + 1
    );
  }

  const wanted = dueForRepeat(parents, openByFamily, today);

  for (const { task, due } of wanted) {
    const p = parents.find((x) => x.id === task.id)!;
    const { data: made, error: insErr } = await db
      .from("tasks")
      .insert({
        tenant_id: tenantId,
        title: p.title,
        body: p.body,
        priority: p.priority ?? "normal",
        due_on: due,
        order_id: p.order_id,
        repeat_parent_id: p.id,
        created_by: "التكرار",
        // **التنبيه مابيتنقلش للنسخة بقصد** — تنبيه اتظبط على تاسك واحد
        // مش وعد بتنبيه على كل نسخة بعده لحد آخر الدهر
      })
      .select("id")
      .maybeSingle();
    if (insErr) continue;

    // نفس الناس اللي على الأصل بيتنقلوا للنسخة
    const kidId = (made as { id: string } | null)?.id;
    const people = p.task_assignees ?? [];
    if (kidId && people.length > 0) {
      await db.from("task_assignees").insert(
        people.map((a) => ({
          task_id: kidId,
          user_id: a.user_id,
          user_name: a.user_name,
          tenant_id: tenantId,
        }))
      );
    }

    // **الأصل بيتحرّك لميعاده الجديد** عشان المرة الجاية تتحسب منه.
    // من غير ده كل تشغيل هيحسب من نفس التاريخ القديم.
    await db
      .from("tasks")
      .update({ due_on: due })
      .eq("tenant_id", tenantId)
      .eq("id", p.id);
    out.created++;
  }

  return out;
}

// ==========================================================================
// تشغيل تنبيهات التاسك
// --------------------------------------------------------------------------
// القرار كله في `lib/task-remind.ts` (دوال صافية). الملف ده بيوصّله بقاعدة
// البيانات وبالإرسال بس.
//
// **التنبيه بيروح للي التاسك عليه، مش للكل.** والتاسك اللي مالوش مسؤول
// مابياخدش تنبيه أصلاً — إشعار لكل الشركة عشان حاجة على حد مش معروف مين
// هو ده زنّ، والشاشة بتقول ده للي بيظبّط التنبيه.
//
// وقاعدة السيستم زي ما هي: **الإرسال مايوقفش أي حاجة**. تاسك وقع إشعاره
// بيتعلّم إنه اتبعت برضه وبيكمّل — أهون من إنه يفضل يحاول كل ربع ساعة.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { dueForReminder, reminderLabel, type RemindableTask } from "./task-remind";
import { notifyPeople } from "./push/notify";
import { alertHead } from "./alert-messages";
import { dueLabel } from "./tasks";

export type RemindResult = { sent: number; checked: number; silent: number };

type Row = RemindableTask & {
  title: string;
  due_on: string | null;
  task_assignees: { user_id: string; user_name: string | null }[];
};

/**
 * رسالة التنبيه — نفس شكل باقي إشعارات السيستم: الجملة فوق والأسامي تحتها.
 * والإيموجي في آخر السطر مش أوله (السبب في `lib/alert-messages.ts`).
 */
export function reminderMessage(a: {
  title: string;
  names: string;
  due: string | null;
  every: string | null;
  last: boolean;
}): string {
  const lines = alertHead("⏰", `فاكرك: ${a.title}`, a.names);

  if (a.due) lines.push(a.due);
  // **آخر تنبيه؟ نقولها** — التاسك اللي بيسكت فجأة بيتفهم غلط إنه اتقفل
  if (a.last) lines.push("ده آخر تنبيه — التاسك لسه مفتوح");
  else if (a.every) lines.push(`بيتكرر ${a.every} لحد ما يخلص`);

  return lines.filter(Boolean).join("\n");
}

export async function runTaskReminders(opts: {
  db: SupabaseClient;
  tenantId: string;
  now?: Date;
  today: string;
  /** يعرض من غير ما يبعت ولا يكتب — نفس قاعدة `?dry=1` في السيستم كله */
  dry?: boolean;
}): Promise<RemindResult> {
  const { db, tenantId, today, dry } = opts;
  const now = opts.now ?? new Date();
  const out: RemindResult = { sent: 0, checked: 0, silent: 0 };

  // اللي ميعاده فات ولسه مخلصش — الفهرس الجزئي بيخلّيها رخيصة
  const { data, error } = await db
    .from("tasks")
    .select(
      "id, title, status, due_on, remind_at, remind_every, remind_unit, remind_count, task_assignees(user_id, user_name)"
    )
    .eq("tenant_id", tenantId)
    .not("remind_at", "is", null)
    .neq("status", "done")
    .lte("remind_at", now.toISOString())
    .limit(200);

  // الأعمدة لسه ماتعملتش؟ نعدّي بهدوء زي مولّد التكرار
  if (error || !data) return out;

  const rows = data as unknown as Row[];
  out.checked = rows.length;
  if (rows.length === 0) return out;

  const decisions = dueForReminder(rows, now);
  if (decisions.length === 0) return out;

  // **`task_assignees.user_id` بيشاور على `app_users.id`، والإشعار محتاج
  // `auth_user_id`** — نفس الفخ اللي خلّى فلتر «اللي عليّا» راجع فاضي.
  const appIds = [
    ...new Set(
      decisions.flatMap((d) =>
        ((d.task as Row).task_assignees ?? []).map((a) => a.user_id)
      )
    ),
  ];
  const authByApp = new Map<string, string>();
  if (appIds.length > 0) {
    const { data: users } = await db
      .from("app_users")
      .select("id, auth_user_id")
      .eq("tenant_id", tenantId)
      .in("id", appIds);
    for (const u of (users ?? []) as { id: string; auth_user_id: string }[]) {
      if (u.auth_user_id) authByApp.set(u.id, u.auth_user_id);
    }
  }

  for (const d of decisions) {
    const row = d.task as Row;
    const people = row.task_assignees ?? [];
    const targets = people
      .map((a) => authByApp.get(a.user_id))
      .filter((v): v is string => Boolean(v));

    // مالوش مسؤول؟ **مابنبعتش لحد** — ونسيب ميعاده زي ما هو عشان أول ما
    // يتسند لحد ياخد تنبيهه
    if (targets.length === 0) {
      out.silent++;
      continue;
    }

    const message = reminderMessage({
      title: row.title,
      names: people.map((a) => a.user_name).filter(Boolean).join("، "),
      due: dueLabel(row.due_on, today),
      every: reminderLabel(row),
      last: d.last,
    });

    if (dry) {
      out.sent++;
      continue;
    }

    try {
      await notifyPeople(db, tenantId, targets, message, {
        url: `/tasks/${row.id}`,
        tag: `task-remind-${row.id}`,
      });
    } catch {
      // الإرسال مايوقفش أي حاجة — بنكمّل ونعلّم إنه اتبعت
    }

    // **بيتكتب حتى لو الإرسال وقع** — من غير كده التاسك هيحاول كل ربع
    // ساعة على طول
    await db
      .from("tasks")
      .update({
        remind_at: d.next,
        remind_count: Number(row.remind_count ?? 0) + 1,
        remind_last_at: now.toISOString(),
      })
      .eq("id", row.id);

    out.sent++;
  }

  return out;
}

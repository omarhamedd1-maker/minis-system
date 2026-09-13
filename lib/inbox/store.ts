// ==========================================================================
// تخزين رسايل الصندوق
// --------------------------------------------------------------------------
// القرار كله في الملفات الصافية جنبه. الملف ده بيوصّلها بقاعدة البيانات بس.
//
// ⚠️⚠️ **الويب هوك مالهوش جلسة** — يعني مافيش «البيزنس بتاع اليوزر». البيزنس
// بيتعرف **من الحساب اللي وصلته الرسالة** (رقم الواتساب أو الصفحة أو حساب
// إنستجرام). ولو مالقيناهوش، الرسالة **بتترمي** — التخمين هنا معناه كلام
// عميل بيدخل صندوق بيزنس تاني.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneKey } from "../phone";
import type { IncomingMessage, StatusUpdate } from "./meta-payload";

/**
 * البيزنس صاحب الحساب ده.
 *
 * ⚠️ **بيدوّر في تلات أعمدة** — كل قناة ليها معرّفها، والتلاتة في نفس
 * الصف. الرسالة اللي مالهاش بيزنس بترجّع `null` ومابتتخزّنش.
 */
export async function tenantForAccount(
  db: SupabaseClient,
  accountId: string | null
): Promise<string | null> {
  const id = String(accountId ?? "").trim();
  if (!id) return null;

  const { data, error } = await db
    .from("tenant_credentials")
    .select("tenant_id, meta_page_id, whatsapp_phone_id, instagram_account_id")
    .or(
      [
        `meta_page_id.eq.${id}`,
        `whatsapp_phone_id.eq.${id}`,
        `instagram_account_id.eq.${id}`,
      ].join(",")
    )
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { tenant_id: string }).tenant_id ?? null;
}

/**
 * العميل صاحب الرقم ده.
 *
 * ⚠️ **واتساب بس** — إنستجرام وماسنجر مابيدّوش تليفون خالص، فالمحادثة
 * بتفضل من غير عميل لحد ما حد يربطها بإيده. **ومابنخترعش عميل من رسالة**:
 * العميل اللي مالوش أوردر بيلخبط كل الأرقام في السيستم.
 */
export async function customerForPhone(
  db: SupabaseClient,
  tenantId: string,
  phone: string
): Promise<string | null> {
  const key = phoneKey(phone);
  if (!key) return null;

  const { data } = await db
    .from("customers")
    .select("id, phone")
    .eq("tenant_id", tenantId)
    .limit(500);

  const hit = (data ?? []).find(
    (c) => phoneKey((c as { phone: string | null }).phone) === key
  );
  return (hit as { id: string } | undefined)?.id ?? null;
}

export type RecordResult = {
  stored: number;
  duplicate: number;
  noTenant: number;
  /**
   * المحادثات اللي **بدأت** تستنى رد دلوقتي.
   *
   * ⚠️⚠️ **مش كل رسالة جاية.** العميل اللي بيبعت خمس رسايل ورا بعض
   * محتاج إشعار واحد — الخمسة إشعارات بتخلّي الإشعارات كلها تتقفل من
   * التليفون، وساعتها بتخسر اللي فيه خبر كمان.
   *
   * فالسطر بيتزوّد هنا لما المحادثة تكون **مقروءة قبلها** بس.
   */
  notify: { tenantId: string; conversationId: string; title: string }[];
};

/**
 * بيسجّل الرسايل الجاية.
 *
 * ⚠️⚠️ **التكرار بيتمنع بالقيد في الداتابيز، مش بفحص قبل الكتابة.** ميتا
 * بتبعت نفس الرسالة أكتر من مرة والمحاولات بتتزامن — فالفحص-ثم-الكتابة
 * بيسيب شباك بين الاتنين. بنكتب وبنتعامل مع الرفض.
 */
export async function recordIncoming(
  db: SupabaseClient,
  messages: IncomingMessage[],
  now = new Date()
): Promise<RecordResult> {
  const out: RecordResult = { stored: 0, duplicate: 0, noTenant: 0, notify: [] };

  for (const msg of messages) {
    const tenantId = await tenantForAccount(db, msg.accountId);
    if (!tenantId) {
      out.noTenant++;
      continue;
    }

    const conversationId = await upsertConversation(db, tenantId, msg, now);
    if (!conversationId) continue;

    // العدّاد **قبل** الكتابة — هو اللي بيقول المحادثة كانت مقروءة ولا لأ
    const before = await currentUnread(db, tenantId, conversationId);

    const { error } = await db.from("conversation_messages").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: "in",
      body: msg.body,
      attachment_url: msg.attachmentUrl,
      attachment_type: msg.attachmentType,
      external_id: msg.messageId,
      status: "delivered",
      created_at: msg.at,
    });

    if (error) {
      // ٢٣٥٠٥ = القيد الفريد رفض — يعني الرسالة دي عندنا خلاص
      if (error.code === "23505") out.duplicate++;
      continue;
    }

    out.stored++;

    // ⚠️ **العدّاد والوقت بيتحدّثوا بعد ما الرسالة تتخزّن بنجاح بس** —
    // لو اتحدّثوا قبلها، الرسالة المكررة بتزوّد «غير مقروء» من غير رسالة.
    await db
      .from("conversations")
      .update({
        last_message_at: msg.at,
        last_inbound_at: msg.at,
        unread: before + 1,
        archived: false,
      })
      .eq("tenant_id", tenantId)
      .eq("id", conversationId);

    if (before === 0) {
      out.notify.push({
        tenantId,
        conversationId,
        title: msg.displayName ?? msg.externalId,
      });
    }
  }

  return out;
}

async function currentUnread(
  db: SupabaseClient,
  tenantId: string,
  conversationId: string
): Promise<number> {
  const { data } = await db
    .from("conversations")
    .select("unread")
    .eq("tenant_id", tenantId)
    .eq("id", conversationId)
    .maybeSingle();
  return Number((data as { unread: number } | null)?.unread ?? 0);
}

async function upsertConversation(
  db: SupabaseClient,
  tenantId: string,
  msg: IncomingMessage,
  now: Date
): Promise<string | null> {
  const { data: found } = await db
    .from("conversations")
    .select("id, display_name, customer_id")
    .eq("tenant_id", tenantId)
    .eq("channel", msg.channel)
    .eq("external_id", msg.externalId)
    .maybeSingle();

  const existing = found as
    | { id: string; display_name: string | null; customer_id: string | null }
    | null;

  if (existing) {
    // الاسم بيتحدّث لو كان فاضي — وعمر لو سمّاها بإيده مابنلمسهاش
    if (!existing.display_name && msg.displayName) {
      await db
        .from("conversations")
        .update({ display_name: msg.displayName })
        .eq("tenant_id", tenantId)
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const customerId =
    msg.channel === "whatsapp"
      ? await customerForPhone(db, tenantId, msg.externalId)
      : null;

  const { data: created, error } = await db
    .from("conversations")
    .insert({
      tenant_id: tenantId,
      channel: msg.channel,
      external_id: msg.externalId,
      customer_id: customerId,
      display_name: msg.displayName,
      last_message_at: msg.at,
      last_inbound_at: msg.at,
      unread: 0,
      created_at: now.toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // اتعملت في نفس اللحظة من طلب تاني — نجيبها
    const { data: again } = await db
      .from("conversations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("channel", msg.channel)
      .eq("external_id", msg.externalId)
      .maybeSingle();
    return (again as { id: string } | null)?.id ?? null;
  }

  return (created as { id: string } | null)?.id ?? null;
}

/**
 * حالة رسالة بعتناها — وصلت، اتقرت، أو فشلت.
 *
 * ⚠️⚠️ **الفلتر على البيزنس لازم هنا.** معرّف الرسالة عند ميتا فريد
 * **جوّه البيزنس** بس (القيد نفسه على `tenant_id, external_id`) — فتحديث
 * بالمعرّف لوحده ممكن يغيّر حالة رسالة بيزنس تاني.
 *
 * ⚠️ **واللي مالوش بيزنس بيتساب** — مانخمّنش.
 */
export async function applyStatuses(
  db: SupabaseClient,
  statuses: StatusUpdate[]
): Promise<number> {
  let done = 0;
  for (const s of statuses) {
    const tenantId = await tenantForAccount(db, s.accountId);
    if (!tenantId) continue;

    const { error } = await db
      .from("conversation_messages")
      .update({ status: s.status, error: s.error })
      .eq("tenant_id", tenantId)
      .eq("external_id", s.messageId);
    if (!error) done++;
  }
  return done;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { loadTenantCredentials } from "@/lib/tenant-settings";
import { replyWindow, isChannel } from "@/lib/inbox/channel";
import { sendMessage } from "@/lib/inbox/send";

/**
 * الرد على العميل.
 *
 * ⚠️⚠️ **بيتخزّن بعد ما يوصل بس.** لو خزّنّا الأول وبعدين بعتنا، الرسالة
 * اللي ميتا رفضتها بتفضل في الشاشة كأنها راحت — واللي بيرد بيقفل المحادثة
 * وهو فاكر إنه رد، والعميل مستني.
 */
export async function replyToThread(formData: FormData): Promise<void> {
  const me = await requirePermission("inbox.reply");
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const back = `/inbox/${id}`;

  if (!id) redirect("/inbox");
  if (!body) redirect(back + "?error=" + encodeURIComponent("الرسالة فاضية"));

  const db = createAdminClient();
  const { data } = await db
    .from("conversations")
    .select("id, channel, external_id, last_inbound_at")
    // ⚠️ **الفلتر على البيزنس لازم** — بمفتاح الأدمن، من غيره ينفع ترد
    // على محادثة بيزنس تاني بمجرد معرفة المعرّف
    .eq("tenant_id", me.tenantId)
    .eq("id", id)
    .maybeSingle();

  const thread = data as {
    id: string;
    channel: string;
    external_id: string;
    last_inbound_at: string | null;
  } | null;

  if (!thread || !isChannel(thread.channel)) {
    redirect("/inbox?error=" + encodeURIComponent("المحادثة دي مش موجودة"));
  }

  const win = replyWindow(thread!.last_inbound_at, new Date());
  if (!win.open) {
    redirect(back + "?error=" + encodeURIComponent(win.note ?? "الرد مقفول"));
  }

  const creds = await loadTenantCredentials(db, me.tenantId);
  const result = await sendMessage(
    {
      channel: thread!.channel as "whatsapp" | "instagram" | "messenger",
      externalId: thread!.external_id,
      whatsappPhoneId: creds.whatsappPhoneId,
      whatsappToken: creds.whatsappToken,
      pageToken: creds.metaPageToken,
    },
    body
  );

  if (!result.ok) {
    redirect(back + "?error=" + encodeURIComponent(result.error));
  }

  await db.from("conversation_messages").insert({
    tenant_id: me.tenantId,
    conversation_id: id,
    direction: "out",
    body,
    external_id: result.messageId,
    sent_by_name: me.fullName ?? me.email,
    status: "sent",
  });

  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), unread: 0 })
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  await logActivity(me, "inbox.reply", "رد على عميل في صندوق الرسايل");
  revalidatePath(back);
  redirect(back);
}

/** المحادثة اتقريت — العدّاد بيرجع صفر */
export async function markRead(formData: FormData): Promise<void> {
  const me = await requirePermission("inbox.view");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const db = createAdminClient();
  await db
    .from("conversations")
    .update({ unread: 0 })
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${id}`);
}

/**
 * ربط المحادثة بعميل.
 *
 * ⚠️ **إنستجرام وماسنجر مابيدّوش تليفون** — فالربط بإيد اللي بيرد هو
 * الطريقة الوحيدة إن كلام العميل يوصل بأوردراته.
 */
export async function linkCustomer(formData: FormData): Promise<void> {
  const me = await requirePermission("inbox.reply");
  const id = String(formData.get("id") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const back = `/inbox/${id}`;
  if (!id) redirect("/inbox");

  const db = createAdminClient();

  if (customerId) {
    const { data: exists } = await db
      .from("customers")
      .select("id")
      .eq("tenant_id", me.tenantId)
      .eq("id", customerId)
      .maybeSingle();
    if (!exists) {
      redirect(back + "?error=" + encodeURIComponent("العميل ده مش موجود"));
    }
  }

  const { error } = await db
    .from("conversations")
    .update({ customer_id: customerId || null })
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  if (error) {
    redirect(back + "?error=" + encodeURIComponent("معرفناش نربطها: " + error.message));
  }

  revalidatePath(back);
  redirect(back + "?saved=1");
}

/** المحادثة اتقفلت — بتخرج من القايمة من غير ما حاجة تتمسح */
export async function archiveThread(formData: FormData): Promise<void> {
  const me = await requirePermission("inbox.reply");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const db = createAdminClient();
  await db
    .from("conversations")
    .update({ archived: true, unread: 0 })
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  revalidatePath("/inbox");
  redirect("/inbox");
}

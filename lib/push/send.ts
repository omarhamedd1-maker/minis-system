// ==========================================================================
// إشعارات من السيستم نفسه على الموبايل (Web Push)
// --------------------------------------------------------------------------
// الفرق عن تليجرام: ده إشعار بيطلع على شاشة الموبايل من التطبيق نفسه، من
// غير أي وسيط. مجاني بالكامل — مفيش مزوّد ولا اشتراك.
//
// **على الآيفون شغال بشرط واحد**: المستخدم يفتح الموقع من الأيقونة اللي
// على الشاشة الرئيسية (Add to Home Screen) مش من سفاري. آبل مابتسمحش بغير
// كده، ودي مش حاجة نقدر نتحكم فيها من الكود.
//
// وقاعدة زي تليجرام: **الإرسال مايوقفش أي حاجة**. مفيش مفاتيح أو مفيش
// أجهزة؟ بنكمّل عادي.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/** الجهاز اللي فشل كده مرات بيتشال — يعني المستخدم شال التطبيق أو رفض */
const MAX_FAILURES = 5;

export type PushConfig = { publicKey: string; privateKey: string };

/**
 * بيقرا مفاتيح التوقيع، وبيولّدها لو لسه مش موجودة.
 * التوليد من جوّه السيستم بقصد — عشان المفتاح السري مايعدّيش في شات ولا
 * محتاج حد يحطه في فيرسل بإيده.
 */
export async function ensurePushKeys(
  db: SupabaseClient
): Promise<PushConfig | null> {
  try {
    const { data } = await db
      .from("push_config")
      .select("vapid_public, vapid_private")
      .eq("id", 1)
      .maybeSingle();

    if (data?.vapid_public && data?.vapid_private) {
      return { publicKey: data.vapid_public, privateKey: data.vapid_private };
    }

    const pair = webpush.generateVAPIDKeys();
    const { error } = await db.from("push_config").insert({
      id: 1,
      vapid_public: pair.publicKey,
      vapid_private: pair.privateKey,
    });
    if (error) return null;

    return { publicKey: pair.publicKey, privateKey: pair.privateKey };
  } catch {
    return null;
  }
}

/** المفتاح العام بس — ده اللي المتصفح محتاجه، ومفيش مشكلة إنه ظاهر */
export async function readPublicKey(
  db: SupabaseClient
): Promise<string | null> {
  const keys = await ensurePushKeys(db);
  return keys?.publicKey ?? null;
}

export type PushMessage = {
  title: string;
  body: string;
  /** الرابط اللي بيتفتح لما تدوس على الإشعار */
  url?: string;
  /** إشعارات بنفس التاج بتستبدل بعضها بدل ما تتراكم */
  tag?: string;
};

/** الجهاز ده آيفون؟ آبل ليها عنوان خدمة خاص بيها */
export function isApple(endpoint: string): boolean {
  return String(endpoint ?? "").includes("web.push.apple.com");
}

/**
 * شكل الإشعار حسب الجهاز.
 *
 * **آبل بتحط سطر `from <اسم التطبيق>` تحت العنوان مباشرةً**، فالإشعار كان
 * بيطلع: الجملة، وتحتها سطر آبل، وتحته الاسم — يعني سطر آبل مقحوم في نص
 * كلامنا.
 *
 * الحيلة: نسيب العنوان **مسافة واحدة** وننزّل كل الكلام في الجسم. ساعتها
 * آبل بتحط سطرها فوق خالص والكلام كله يبقى تحته بالترتيب:
 *
 *     from MINIS
 *     أوردر ١٣٧٤ لسه مش مؤكد
 *     أمينة فتحي
 *
 * ⚠️ **والعنوان الفاضي تمامًا مش حل** — جرّبناه فالخدمة حطّت اسم التطبيق
 * كعنوان، فطلع سطر زيادة مالوش لازمة.
 *
 * وعلى الأندرويد بنسيبه زي ما هو: هناك العنوان بيتعرض عريض والمصدر بيتكتب
 * تحت خالص، فالمسافة كانت هتطلع سطر عريض فاضي.
 */
export function shapeFor(
  endpoint: string,
  msg: PushMessage
): { title: string; body: string } {
  if (!isApple(endpoint)) return { title: msg.title, body: msg.body };
  return {
    title: " ",
    body: [msg.title, msg.body].filter((s) => s.trim()).join("\n"),
  };
}

export type PushResult = {
  sent: number;
  removed: number;
  skipped: "no_keys" | "no_devices" | null;
};

/**
 * بيبعت لكل أجهزة البيزنس.
 * الجهاز اللي المتصفح بيقول عليه إنه مابقاش موجود (٤٠٤/٤١٠) بيتشال فورًا —
 * ده معناه إن المستخدم شال التطبيق أو الاشتراك انتهى.
 */
export async function sendPush(
  db: SupabaseClient,
  tenantId: string,
  msg: PushMessage
): Promise<PushResult> {
  const keys = await ensurePushKeys(db);
  if (!keys) return { sent: 0, removed: 0, skipped: "no_keys" };

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failures")
    .eq("tenant_id", tenantId);

  const devices = (subs ?? []) as unknown as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    failures: number;
  }[];

  if (devices.length === 0) {
    return { sent: 0, removed: 0, skipped: "no_devices" };
  }

  webpush.setVapidDetails(
    "mailto:omarhamedd1@gmail.com",
    keys.publicKey,
    keys.privateKey
  );

  let sent = 0;
  let removed = 0;

  for (const d of devices) {
    // **الشكل بيتبنى لكل جهاز لوحده** — الآيفون ليه ترتيب مختلف
    const payload = JSON.stringify({
      ...shapeFor(d.endpoint, msg),
      url: msg.url ?? "/orders",
      tag: msg.tag,
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: d.endpoint,
          keys: { p256dh: d.p256dh, auth: d.auth },
        },
        payload
      );
      sent++;
      await db
        .from("push_subscriptions")
        .update({ last_ok_at: new Date().toISOString(), failures: 0 })
        .eq("id", d.id);
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      const gone = status === 404 || status === 410;
      const failures = d.failures + 1;

      if (gone || failures >= MAX_FAILURES) {
        await db.from("push_subscriptions").delete().eq("id", d.id);
        removed++;
      } else {
        await db
          .from("push_subscriptions")
          .update({ failures })
          .eq("id", d.id);
      }
    }
  }

  return { sent, removed, skipped: null };
}

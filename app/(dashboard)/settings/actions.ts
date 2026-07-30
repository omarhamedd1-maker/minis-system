"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { testConnection } from "@/lib/bosta/client";
import { discoverChats, testTelegram } from "@/lib/telegram";

// بترجّع never لأن redirect بترمي — وده بيخلي TypeScript يفهم إن اللي بعدها
// مابيتنفذش، فمانحتاجش else في كل مكان
function back(msg: string, ok = false): never {
  redirect(`/settings?${ok ? "saved" : "error"}=` + encodeURIComponent(msg));
}

/** بيتأكد إن المفتاح شغال فعلاً عند بوسطة قبل ما نحفظه */
export async function saveBostaKey(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const key = String(formData.get("bosta_api_key") ?? "").trim();
  const pickup = String(formData.get("bosta_pickup") ?? "").trim();

  if (!key) back("اكتب مفتاح بوسطة");

  const result = await testConnection(key);
  if (!result.ok) {
    back("المفتاح مارضيش يشتغل: " + (result.error ?? "بوسطة رفضته"));
  }

  const { error } = await createAdminClient()
    .from("tenant_credentials")
    .update({
      bosta_api_key: key,
      bosta_pickup_address_id: pickup || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نحفظ المفتاح: " + error.message);

  await logActivity(me, "settings.bosta", "ربط حساب بوسطة");
  revalidatePath("/settings");
  back("تمام — المفتاح اتجرّب واشتغل واتحفظ", true);
}

/**
 * تنبيهات تليجرام. بنجرّبها قبل الحفظ زي مفتاح بوسطة بالظبط — التنبيه اللي
 * ماوصلش أوحش من إنه مش موجود، فمينفعش نحفظ إعداد ماجرّبناهوش.
 */
export async function saveTelegram(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const token = String(formData.get("telegram_bot_token") ?? "").trim();
  let chatId = String(formData.get("telegram_chat_id") ?? "").trim();

  const db = createAdminClient();

  // فاضيين = إيقاف التنبيهات
  if (!token && !chatId) {
    const { error } = await db
      .from("tenant_credentials")
      .update({
        telegram_bot_token: null,
        telegram_chat_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", me.tenantId);
    if (error) back("معرفناش نحفظ: " + error.message);
    await logActivity(me, "settings.telegram", "وقّف تنبيهات تليجرام");
    revalidatePath("/settings");
    back("التنبيهات اتوقفت", true);
  }

  if (!token) back("اكتب توكن البوت");

  // مافيش رقم جروب؟ نلاقيه إحنا بدل ما المستخدم يقرا JSON بإيده
  if (!chatId) {
    const found = await discoverChats(token);
    if (!found.ok) back("التوكن مارضيش يشتغل: " + found.error);

    if (found.chats.length === 0) {
      back(
        "البوت مش شايف أي جروب. ضيفه في الجروب وابعت أي رسالة هناك، وبعدين دوس احفظ تاني."
      );
    }
    if (found.chats.length > 1) {
      back(
        "البوت شايف أكتر من محادثة — اكتب رقم اللي عايزه في خانة رقم الجروب: " +
          found.chats.map((c) => `${c.title} (${c.id})`).join(" · ")
      );
    }
    chatId = found.chats[0].id;
  }

  const { error } = await db
    .from("tenant_credentials")
    .update({
      telegram_bot_token: token,
      telegram_chat_id: chatId,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) {
    back(
      "معرفناش نحفظ: " +
        error.message +
        " — لو الخانات لسه مااتعملتش شغّل sql/telegram.sql"
    );
  }

  // بنجرّب بعد الحفظ عشان الإرسال بيقرا المفاتيح من الجدول
  const test = await testTelegram(db, me.tenantId);
  if (!test.ok) {
    back(
      "اتحفظ بس التجربة فشلت: " +
        (test.reason === "not_configured"
          ? "المفاتيح مش مقروءة"
          : (test.error ?? "تليجرام رفض"))
    );
  }

  await logActivity(me, "settings.telegram", "ربط تنبيهات تليجرام");
  revalidatePath("/settings");
  back("تمام — بعتنا رسالة تجربة على الجروب", true);
}

/** بيبعت رسالة تجربة بالمفاتيح المحفوظة */
export async function checkTelegram() {
  const me = await requirePermission("admin.settings");
  const result = await testTelegram(createAdminClient(), me.tenantId);
  if (result.ok) back("الرسالة وصلت الجروب ✓", true);
  back(
    result.reason === "not_configured"
      ? "لسه مفيش بوت محفوظ"
      : "مااتبعتتش: " + (result.error ?? "تليجرام رفض")
  );
}

/** بيجرّب المفتاح المحفوظ من غير ما يغيّر حاجة */
export async function checkBostaConnection() {
  const me = await requirePermission("admin.settings");

  const { data } = await createAdminClient()
    .from("tenant_credentials")
    .select("bosta_api_key")
    .eq("tenant_id", me.tenantId)
    .maybeSingle();

  if (!data?.bosta_api_key) back("لسه مفيش مفتاح محفوظ");

  const result = await testConnection(data!.bosta_api_key!);
  if (result.ok) back("الاتصال ببوسطة شغال ✓", true);
  back("الاتصال مش شغال: " + (result.error ?? "بوسطة رفضت المفتاح"));
}

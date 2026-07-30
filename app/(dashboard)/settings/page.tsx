import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import {
  checkBostaConnection,
  checkTelegram,
  saveBostaKey,
  saveTelegram,
} from "./actions";
import { looksLikeChatId } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none";
const label = "text-xs text-gray-500";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const me = await requirePagePermission("admin.settings");

  const db = createAdminClient();
  const [{ data: tenant }, { data: creds }] = await Promise.all([
    db.from("tenants").select("name").eq("id", me.tenantId).maybeSingle(),
    db
      .from("tenant_credentials")
      .select(
        "bosta_api_key, bosta_pickup_address_id, telegram_bot_token, telegram_chat_id"
      )
      .eq("tenant_id", me.tenantId)
      .maybeSingle(),
  ]);

  const hasBosta = Boolean(creds?.bosta_api_key);
  const hasTelegram = Boolean(creds?.telegram_bot_token);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">الإعدادات</h1>
        <p className="mt-1 text-xs text-gray-400">
          {tenant?.name ?? "بيزنسك"}
        </p>
      </div>

      {saved && (
        <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
          {saved}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">ربط بوسطة</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              hasBosta
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {hasBosta ? "مربوط" : "لسه مش مربوط"}
          </span>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          من غير الربط ده، السيستم مش هيقدر يبعت شحنات ولا يجيب حالاتها ولا
          يحسب رسومها.
        </p>

        <form action={saveBostaKey} className="mt-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="bosta_api_key" className={label}>
              مفتاح بوسطة {hasBosta && "— اكتب واحد جديد عشان تغيّره"}
            </label>
            <input
              id="bosta_api_key"
              name="bosta_api_key"
              type="password"
              autoComplete="off"
              placeholder={hasBosta ? "••••••••••••" : "الزق المفتاح هنا"}
              className={input}
            />
            <span className="text-[11px] text-gray-400">
              هتلاقيه في بوسطة تحت <b>ربط التطبيقات</b>. لو عملت مفتاح جديد،
              انسخه فورًا — بوسطة مابتعرضهوش تاني.
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="bosta_pickup" className={label}>
              رقم عنوان الاستلام (اختياري)
            </label>
            <input
              id="bosta_pickup"
              name="bosta_pickup"
              defaultValue={creds?.bosta_pickup_address_id ?? ""}
              placeholder="لو عندك أكتر من فرع في بوسطة"
              className={input}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              احفظ واتأكد إنه شغال
            </button>
            {hasBosta && (
              <button
                type="submit"
                formAction={checkBostaConnection}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                جرّب الاتصال
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            مش هنحفظ المفتاح غير لما نتأكد إنه بيشتغل فعلًا عند بوسطة.
          </p>
        </form>
      </div>

      {/* ===== تنبيهات تليجرام ===== */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-900">
          تنبيهات على الموبايل
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          أول ما عميل مايستلمش شحنته أو المزامنة تقف، توصلك رسالة فورًا على
          جروب تليجرام.
        </p>

        <form action={saveTelegram} className="mt-4 space-y-3">
          <div>
            <label htmlFor="telegram_bot_token" className={label}>
              توكن البوت
            </label>
            <input
              id="telegram_bot_token"
              name="telegram_bot_token"
              type="password"
              defaultValue={hasTelegram ? "" : undefined}
              placeholder={
                hasTelegram ? "محفوظ — اكتب واحد جديد لو عايز تغيّره" : "123456:ABC-DEF…"
              }
              className={input}
              dir="ltr"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="telegram_chat_id" className={label}>
              رقم الجروب — سيبه فاضي والسيستم يلاقيه لوحده
            </label>
            <input
              id="telegram_chat_id"
              name="telegram_chat_id"
              defaultValue={
                looksLikeChatId(creds?.telegram_chat_id) ? creds!.telegram_chat_id! : ""
              }
              placeholder="-1001234567890"
              className={input}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              data-form-type="other"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              احفظ وابعت رسالة تجربة
            </button>
            {hasTelegram && (
              <button
                type="submit"
                formAction={checkTelegram}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                ابعت تجربة
              </button>
            )}
          </div>
        </form>

        <div className="mt-4 rounded-xl bg-gray-50 p-3 text-[11px] leading-6 text-gray-500">
          <span className="font-bold text-gray-700">٣ خطوات بس:</span>
          <br />
          ١. في تليجرام كلّم <span dir="ltr">@BotFather</span> واكتب{" "}
          <span dir="ltr">/newbot</span> — هيديك التوكن.
          <br />
          ٢. اعمل جروب، ضيف البوت فيه، وابعت في الجروب{" "}
          <b dir="ltr">/start</b> — <b>لازم أمر يبدأ بـ /</b>، لأن البوت
          مابيشوفش الرسايل العادية (خصوصيته مفعّلة من تليجرام).
          <br />
          ٣. الزق التوكن فوق ودوس احفظ — <b>السيستم هيلاقي الجروب لوحده</b>{" "}
          ويبعتلك رسالة تجربة.
          <br />
          وسيب الخانتين فاضيين لو عايز توقّف التنبيهات.
        </div>
      </div>

      <p className="px-1 text-[11px] leading-5 text-gray-400">
        الشحن اللي العميل بيدفعه بيتقرا من كل أوردر لوحده زي ما نزل من
        شوبيفاي — مفيش رقم ثابت تظبطه. ورسوم بوسطة واحدة للكل فبتتحدّث معانا.
        وأنواع المصاريف بتكتبها وقت ما تسجّل المصروف.
      </p>
    </div>
  );
}

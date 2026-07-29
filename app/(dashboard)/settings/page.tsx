import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import { checkBostaConnection, saveBostaKey } from "./actions";

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
      .select("bosta_api_key, bosta_pickup_address_id")
      .eq("tenant_id", me.tenantId)
      .maybeSingle(),
  ]);

  const hasBosta = Boolean(creds?.bosta_api_key);

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

      <p className="px-1 text-[11px] leading-5 text-gray-400">
        الشحن اللي العميل بيدفعه بيتقرا من كل أوردر لوحده زي ما نزل من
        شوبيفاي — مفيش رقم ثابت تظبطه. ورسوم بوسطة واحدة للكل فبتتحدّث معانا.
        وأنواع المصاريف بتكتبها وقت ما تسجّل المصروف.
      </p>
    </div>
  );
}

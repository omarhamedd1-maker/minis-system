import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import { loadTenantSettings } from "@/lib/tenant-settings";
import { formatMoney } from "@/lib/format";
import {
  checkBostaConnection,
  saveBostaKey,
  saveBusinessSettings,
  saveCarrierFees,
} from "./actions";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none";
const label = "text-xs text-gray-500";
const card = "rounded-xl bg-white p-5 shadow-sm";
const submit =
  "rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700";

function Field({
  name,
  title,
  value,
  hint,
  step,
}: {
  name: string;
  title: string;
  value: string | number;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={label}>
        {title}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        step={step ?? "0.01"}
        defaultValue={String(value)}
        className={input}
      />
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const me = await requirePagePermission("admin.settings");

  const db = createAdminClient();
  const settings = await loadTenantSettings(db, me.tenantId);

  const [{ data: tenant }, { data: creds }] = await Promise.all([
    db.from("tenants").select("name").eq("id", me.tenantId).maybeSingle(),
    db
      .from("tenant_credentials")
      .select("bosta_api_key, bosta_pickup_address_id, shopify_shop")
      .eq("tenant_id", me.tenantId)
      .maybeSingle(),
  ]);

  const hasBosta = Boolean(creds?.bosta_api_key);
  const f = settings.fees;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">إعدادات البيزنس</h1>
        <p className="mt-1 text-xs text-gray-400">
          الأرقام دي بتاعتك إنت بس — أي بيزنس تاني على السيستم ليه أرقامه هو.
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

      {/* ===== الأساسيات ===== */}
      <form action={saveBusinessSettings} className={card}>
        <h2 className="text-sm font-bold text-gray-900">الأساسيات</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="business_name" className={label}>
              اسم البيزنس
            </label>
            <input
              id="business_name"
              name="business_name"
              defaultValue={tenant?.name ?? ""}
              className={input}
            />
          </div>

          <Field
            name="shipping_charge"
            title="الشحن اللي العميل بيدفعه"
            value={settings.shippingCharge}
            hint="بيتحط تلقائي على كل أوردر جديد"
          />
        </div>

        <h3 className="mt-6 text-xs font-bold text-gray-700">
          باقة شركة الشحن
        </h3>
        <p className="mt-1 text-[11px] text-gray-400">
          نصيب الأوردر الواحد من الباقة ={" "}
          {formatMoney(
            settings.bundleShipments
              ? settings.bundlePrice / settings.bundleShipments
              : 0
          )}
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field
            name="bundle_price"
            title="سعر الباقة الشهري"
            value={settings.bundlePrice}
          />
          <Field
            name="bundle_shipments"
            title="عدد الشحنات في الباقة"
            value={settings.bundleShipments}
            step="1"
          />
          <Field
            name="bundle_covers"
            title="الشحن الأساسي اللي بتغطيه"
            value={settings.bundleCovers}
          />
        </div>

        <div className="mt-6 flex flex-col gap-1">
          <label htmlFor="expense_categories" className={label}>
            أنواع المصاريف — نوع في كل سطر
          </label>
          <textarea
            id="expense_categories"
            name="expense_categories"
            rows={5}
            defaultValue={settings.expenseCategories.join("\n")}
            className={input}
          />
        </div>

        <button type="submit" className={`${submit} mt-4`}>
          حفظ
        </button>
      </form>

      {/* ===== ربط بوسطة ===== */}
      <div className={card}>
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
          المفتاح بتاعك بيتخزّن مقفول، ومحدش يقدر يقراه من المتصفح. هتلاقيه في
          بوسطة تحت <span className="font-medium">ربط التطبيقات</span> — ولو
          عملت واحد جديد، انسخه فورًا لأنه مابيظهرش تاني.
        </p>

        <form action={saveBostaKey} className="mt-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="bosta_api_key" className={label}>
              مفتاح بوسطة {hasBosta && "(اكتب واحد جديد عشان تغيّره)"}
            </label>
            <input
              id="bosta_api_key"
              name="bosta_api_key"
              type="password"
              autoComplete="off"
              placeholder={hasBosta ? "••••••••••••" : "الزق المفتاح هنا"}
              className={input}
            />
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
            <button type="submit" className={submit}>
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

      {/* ===== رسوم بوسطة ===== */}
      <form action={saveCarrierFees} className={card}>
        <h2 className="text-sm font-bold text-gray-900">رسوم بوسطة</h2>
        <p className="mt-1 text-xs text-gray-500">
          دي اللي بنحسب بيها تكلفة كل شحنة. لو بوسطة غيّرت أسعارها، عدّلها من
          هنا — هتتطبق على أول مزامنة جاية.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field name="fee_open" title="رسم فتح الشحنة" value={f.openFee} />
          <Field
            name="fee_transfer_rate"
            title="نسبة رسم التحويل"
            value={f.transferRate}
            step="0.001"
            hint="0.01 يعني ١٪"
          />
          <Field
            name="fee_transfer_min"
            title="أقل رسم تحويل"
            value={f.transferMin}
          />
          <Field
            name="fee_cod_rate"
            title="نسبة عمولة التحصيل"
            value={f.codFeeRate}
            step="0.001"
          />
          <Field
            name="fee_cod_threshold"
            title="التحصيل فوق كام تتحسب عمولة"
            value={f.codFeeThreshold}
          />
          <Field
            name="fee_vat"
            title="معامل الضريبة"
            value={f.vat}
            step="0.01"
            hint="1.14 يعني ١٤٪"
          />
          <Field
            name="fee_insurance_rate"
            title="نسبة التأمين"
            value={f.insuranceRate}
            step="0.001"
          />
          <Field
            name="fee_insurance_min"
            title="أقل تأمين"
            value={f.insuranceMin}
          />
          <Field
            name="fee_insurance_max"
            title="أقصى تأمين"
            value={f.insuranceMax}
          />
        </div>

        <button type="submit" className={`${submit} mt-4`}>
          حفظ الرسوم
        </button>
      </form>
    </div>
  );
}

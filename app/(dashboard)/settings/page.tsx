import Link from "next/link";
import { ImportShopifyOrders } from "@/components/ImportShopifyOrders";
import { importShopifyOrders } from "../orders/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import {
  saveBostaKey,
  saveShopify,
  saveShopifyApp,
  disconnectShopify,
} from "./actions";
import { EnablePush } from "@/components/EnablePush";
import { readShopifyApp } from "@/lib/shopify/app";
import { headers } from "next/headers";
import { ImportHistory } from "@/components/ImportHistory";
import { describeUndo, listImportRuns } from "@/lib/import-runs";
import { undoImport } from "../orders/actions";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none";

/** شارة "مربوط / لسه" — نفس الشكل للاتنين */
function Badge({ on }: { on: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        on ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {on ? "مربوط" : "لسه"}
    </span>
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
  const [{ data: tenant }, { data: creds }] = await Promise.all([
    db.from("tenants").select("name").eq("id", me.tenantId).maybeSingle(),
    db
      .from("tenant_credentials")
      .select("bosta_api_key, shopify_shop, shopify_access_token")
      .eq("tenant_id", me.tenantId)
      .maybeSingle(),
  ]);

  const importRuns = (await listImportRuns(db, me.tenantId)).map((run) => ({
    id: run.id,
    kind: run.kind,
    summary: run.summary,
    actorName: run.actor_name,
    createdAt: new Date(run.created_at).toLocaleString("ar-EG", {
      timeZone: "Africa/Cairo",
      dateStyle: "medium",
      timeStyle: "short",
    }),
    undoneAt: run.undone_at,
    undoLines: describeUndo(run.payload ?? {}),
  }));

  const hasBosta = Boolean(creds?.bosta_api_key);
  const hasShopify = Boolean(creds?.shopify_access_token && creds?.shopify_shop);
  const app = await readShopifyApp(db);
  const appReady = Boolean(app);
  const appClientId = app?.clientId ?? null;
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `https://${h.get("host") ?? "minis-system.vercel.app"}`;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">الإعدادات</h1>
        <p className="mt-1 text-xs text-gray-400">{tenant?.name ?? "بيزنسك"}</p>
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

      {/* ===== شوبيفاي — ضغطة واحدة ===== */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">شوبيفاي</h2>
          <Badge on={hasShopify} />
        </div>

        {hasShopify ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-900" dir="ltr">
              {creds?.shopify_shop}
            </span>
            <div className="flex items-center gap-3">
              {/* الجلب مكانه هنا مش في شاشة الأوردرات — ده إعداد ربط
                  بيتعمل مرة كل فترة، مش شغل يومي */}
              <ImportShopifyOrders action={importShopifyOrders} />
              <form action={disconnectShopify}>
                <button type="submit" className="text-xs text-gray-400 underline">
                  افصل
                </button>
              </form>
            </div>
          </div>
        ) : (
          <>
            {appReady && (
              <form action="/api/shopify/install" className="mt-3 flex gap-2">
                <input
                  name="shop"
                  placeholder="yourshop.myshopify.com"
                  className={input}
                  dir="ltr"
                  autoComplete="off"
                  required
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                >
                  اربط
                </button>
              </form>
            )}

            {/* ===== الربط بالمفاتيح — الطريق اللي بيشتغل مع أي متجر =====
                **مش حل احتياطي.** الربط بضغطة بيشتغل بس مع المتاجر اللي
                في نفس حساب شوبيفاي بتاع التطبيق. أي عميل بره الحساب ده
                لازم يعدّي من هنا، وده بيتطلب توزيع عام من شوبيفاي (بمراجعة
                منهم) عشان يتغيّر. فالخطوات مكتوبة بالتفصيل عشان صاحب
                المتجر يعملها بنفسه من غير مبرمج. */}
            <details className="group mt-3 rounded-lg border border-gray-200" open={!appReady}>
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-gray-900">
                {appReady ? "أو اربط بمفاتيح متجرك" : "اربط متجرك بمفاتيحه"}
                <span className="mt-0.5 block text-[10px] font-normal text-gray-500">
                  بتشتغل مع أي متجر · خمس دقايق · مش محتاجة مبرمج
                </span>
              </summary>

              <div className="border-t border-gray-100 p-3">
                {/* ⚠️ **شوبيفاي شالت الطريقة دي من متاجر كتير.**
                    متجر ٢ سِك (١٧ أغسطس) صفحة `Develop apps` فيه بتقول
                    «اعمل تطبيقاتك في Dev Dashboard» ومفيهاش زرار إنشاء
                    خالص. فالتعليمات دي بتبعت الناس تدوّر على حاجة مش
                    موجودة — والقسم اللي تحت هو اللي بيشتغل معاهم. */}
                <p className="mb-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800">
                  <b>لو متجرك مالوش الخيار ده:</b> شوبيفاي نقلت إنشاء
                  التطبيقات للوحة المطوّرين. ساعتها التطبيق بيدّيك{" "}
                  <span dir="ltr">Client ID</span> و
                  <span dir="ltr"> Secret</span> بدل التوكن — استخدم القسم
                  اللي تحت خالص.
                </p>
                <ol className="space-y-2 text-xs text-gray-700">
                  <li>
                    <b>١.</b> من لوحة متجرك:{" "}
                    <span dir="ltr" className="text-gray-900">
                      Settings ← Apps and sales channels ← Develop apps ← Create
                      an app
                    </span>
                  </li>
                  <li>
                    <b>٢.</b> في{" "}
                    <span dir="ltr" className="text-gray-900">
                      Configuration ← Admin API scopes
                    </span>{" "}
                    علّم الأربعة دول بالظبط:
                    <span
                      dir="ltr"
                      className="mt-1 block rounded bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-800"
                    >
                      read_products, read_orders, write_orders, write_order_edits
                    </span>
                  </li>
                  <li>
                    <b>٣.</b> دوس <span dir="ltr">Install app</span>
                  </li>
                  <li>
                    <b>٤.</b> من{" "}
                    <span dir="ltr" className="text-gray-900">
                      API credentials
                    </span>{" "}
                    انسخ{" "}
                    <span dir="ltr" className="text-gray-900">
                      Admin API access token
                    </span>{" "}
                    — بيبدأ بـ<span dir="ltr">shpat_</span> وبيتعرض{" "}
                    <b>مرة واحدة بس</b>
                  </li>
                </ol>

                {/* ⚠️ **التوكن مش المفتاح والسر.** تطبيق المتجر بيدّي توكن
                    جاهز، و`API key`/`API secret` بتوعه مابيطلّعوش توكن —
                    شوبيفاي بترد ٤٠٠ من غير سبب. وخانات المفتاح والسر باقية
                    تحت للتطبيقات المتعمولة من لوحة المطوّرين. */}
                <form action={saveShopify} className="mt-3 space-y-2">
                  <input
                    name="shopify_shop"
                    placeholder="yourshop.myshopify.com"
                    className={input}
                    dir="ltr"
                    autoComplete="off"
                    required
                  />
                  <input
                    name="shopify_token"
                    type="password"
                    placeholder="shpat_… (Admin API access token)"
                    className={input}
                    dir="ltr"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                  >
                    اربط بالتوكن
                  </button>

                  {/* ⚠️ **ده مش قسم نادر، ده اللي بيشتغل مع المتاجر
                      الجديدة.** كان مكتوب بخط رمادي صغير كأنه استثناء،
                      فعمر فتح الخانة الغلط وحط السر مكان التوكن. */}
                  <details className="rounded-lg border border-gray-200 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-gray-700">
                      تطبيقك من لوحة المطوّرين؟ اضغط هنا
                      <span className="mt-0.5 block text-[10px] font-normal text-gray-500">
                        ساعتها معاك <span dir="ltr">Client ID</span> و
                        <span dir="ltr"> Secret</span> — مش توكن
                      </span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      <input
                        name="shopify_client_id"
                        placeholder="API key"
                        className={input}
                        dir="ltr"
                        autoComplete="off"
                      />
                      <input
                        name="shopify_client_secret"
                        type="password"
                        placeholder="API secret key"
                        className={input}
                        dir="ltr"
                        autoComplete="off"
                      />
                    </div>
                  </details>
                </form>

                {/* بنجرّب الاتصال قبل ما نحفظ — فالرد بيقول شغّال ولا لأ
                    على طول بدل ما يكتشفها في أول مزامنة */}
                <p className="mt-2 text-[10px] text-gray-400">
                  هنجرّب الاتصال بمتجرك قبل ما نحفظ — لو المفاتيح غلط هنقولك
                  على طول.
                </p>
              </div>
            </details>
          </>
        )}
      </div>

      {/* ===== بوسطة — مربع المفتاح وبس ===== */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">بوسطة</h2>
          <Badge on={hasBosta} />
        </div>

        <form action={saveBostaKey} className="mt-3 flex gap-2">
          <input
            name="bosta_api_key"
            type="password"
            autoComplete="off"
            placeholder={hasBosta ? "••••••••••••" : "الزق مفتاح بوسطة"}
            className={input}
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            {hasBosta ? "غيّر" : "اربط"}
          </button>
        </form>
      </div>

      {/* ===== إشعارات الموبايل ===== */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">الإشعارات</h2>
        <EnablePush />
      </div>

      <ImportHistory runs={importRuns} undoAction={undoImport} />

      <Link
        href="/orders/reconcile"
        className="flex items-center justify-between gap-3 rounded-xl bg-white p-5 shadow-sm transition-colors hover:bg-gray-50"
      >
        <h2 className="text-sm font-bold text-gray-900">مراجعة الداتا</h2>
        <span className="text-gray-300">←</span>
      </Link>

      {/* ===== تطبيق شوبيفاي — لصاحب المنصة بس ===== */}
      {me.isPlatformAdmin && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-5">
          <h2 className="text-sm font-bold text-gray-900">
            تطبيق شوبيفاي (صاحب المنصة)
          </h2>

          <form action={saveShopifyApp} className="mt-3 space-y-3">
            <input
              name="app_client_id"
              defaultValue={appClientId ?? ""}
              placeholder="Client ID"
              className={input}
              dir="ltr"
              autoComplete="off"
            />
            <input
              name="app_client_secret"
              type="password"
              placeholder={appReady ? "Client Secret — سيبه فاضي" : "Client Secret"}
              className={input}
              dir="ltr"
              autoComplete="off"
            />
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              احفظ
            </button>
          </form>

          <p className="mt-3 text-[11px] leading-6 text-gray-500" dir="ltr">
            {origin}/api/shopify/install
            <br />
            {origin}/api/shopify/callback
          </p>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions";
import { saveBostaKey, saveShopifyApp, disconnectShopify } from "./actions";
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

  const importRuns = (await listImportRuns(db)).map((run) => ({
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
            <form action={disconnectShopify}>
              <button type="submit" className="text-xs text-gray-400 underline">
                افصل
              </button>
            </form>
          </div>
        ) : appReady ? (
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
        ) : (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            تطبيق شوبيفاي لسه مش مظبّط.
          </p>
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

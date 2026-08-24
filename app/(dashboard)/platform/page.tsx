import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { CopyLink } from "@/components/CopyLink";
import { SubmitOnce } from "@/components/SubmitOnce";
import {
  createTenant,
  setSubscriptionEnd,
  setTenantActive,
  setTenantSlug,
  deleteTenant,
} from "./actions";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none";
const label = "text-xs text-gray-500";

type Row = {
  id: string;
  name: string;
  slug: string | null;
  active: boolean;
  subscription_ends_at: string | null;
  created_at: string;
};

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;

  const me = await getSessionUser();
  if (!me || !me.active) redirect("/login");
  if (!me.isPlatformAdmin) redirect("/");

  const db = createAdminClient();
  const { data: tenants } = await db
    .from("tenants")
    .select("id, name, slug, active, subscription_ends_at, created_at")
    .order("created_at")
    .overrideTypes<Row[]>();

  // عدد الأوردرات والمستخدمين لكل بيزنس
  const counts = new Map<string, { orders: number; users: number }>();
  for (const t of tenants ?? []) {
    const [{ count: orders }, { count: users }] = await Promise.all([
      db.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
      db.from("app_users").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
    ]);
    counts.set(t.id, { orders: orders ?? 0, users: users ?? 0 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // **عنوان الموقع من البيئة مش مكتوب في الكود** — لما الدومين يتشترى
  // اللينك يتغيّر لوحده من غير ما حد يفتكر يعدّل الصفحة دي
  const base = process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">البيزنسات</h1>
        <p className="mt-1 text-xs text-gray-400">
          الصفحة دي بتاعتك إنت كصاحب المنصة — مفيش عميل بيشوفها مهما كانت
          صلاحياته.
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

      {/* ===== القايمة ===== */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-start font-medium">البيزنس</th>
                <th className="px-4 py-3 text-start font-medium">أوردرات</th>
                <th className="px-4 py-3 text-start font-medium">مستخدمين</th>
                <th className="px-4 py-3 text-start font-medium">الاشتراك لحد</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {(tenants ?? []).map((t) => {
                const c = counts.get(t.id)!;
                const expired =
                  t.subscription_ends_at && t.subscription_ends_at < today;
                return (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{t.name}</div>
                      <div className="text-[11px] text-gray-400">
                        من {formatDate(t.created_at)}
                        {t.id === me.tenantId && " · بيزنسك"}
                      </div>
                      {/* الاسم المختصر = لينك دخول المتجر، وبيبقى الساب
                          دومين بعدين. بيتغيّر من هنا بس */}
                      <form
                        action={setTenantSlug}
                        className="mt-1.5 flex items-center gap-1"
                      >
                        <input type="hidden" name="tenant_id" value={t.id} />
                        <span className="text-[11px] text-gray-400">/login/</span>
                        <input
                          name="slug"
                          defaultValue={t.slug ?? ""}
                          placeholder="minis"
                          dir="ltr"
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-[11px] text-gray-900 focus:border-gray-900 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-200"
                        >
                          حفظ
                        </button>
                      </form>

                      {/* **اللينك كامل بزرار نسخ** — ده اللي بيتبعت للتيم */}
                      {t.slug && (
                        <CopyLink
                          url={`${base}/login/${t.slug}`}
                          href={`/login/${t.slug}`}
                        />
                      )}

                      <Link
                        href={`/platform/${t.id}`}
                        className="mt-1.5 inline-block text-[11px] font-medium text-sky-700 hover:underline"
                      >
                        بيانات البيزنس ←
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.orders}</td>
                    <td className="px-4 py-3 text-gray-700">{c.users}</td>
                    <td className="px-4 py-3">
                      <form action={setSubscriptionEnd} className="flex items-center gap-1">
                        <input type="hidden" name="tenant_id" value={t.id} />
                        <input
                          type="date"
                          name="subscription_ends_at"
                          defaultValue={t.subscription_ends_at ?? ""}
                          className={`rounded-lg border px-2 py-1 text-xs ${
                            expired
                              ? "border-red-300 bg-red-50 text-red-700"
                              : "border-gray-300 text-gray-900"
                          }`}
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-200"
                        >
                          حفظ
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={setTenantActive}>
                        <input type="hidden" name="tenant_id" value={t.id} />
                        <input type="hidden" name="active" value={t.active ? "0" : "1"} />
                        <button
                          type="submit"
                          disabled={t.id === me.tenantId}
                          className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-40 ${
                            t.active
                              ? "bg-green-50 text-green-700 hover:bg-green-100"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {t.active ? "شغال" : "موقوف"}
                        </button>
                      </form>

                      {/* **الحذف مقفول ومحتاج كتابة الاسم** — مش زرار
                          بيتداس بالغلط. وبيزنسك مالوش زرار أصلًا */}
                      {t.id !== me.tenantId && (
                        <details className="mt-2">
                          <summary className="cursor-pointer list-none text-[11px] text-gray-300 hover:text-red-600">
                            حذف
                          </summary>
                          <form
                            action={deleteTenant}
                            className="mt-1.5 w-56 space-y-1.5 rounded-lg bg-red-50 p-2"
                          >
                            <input type="hidden" name="tenant_id" value={t.id} />
                            <p className="text-[10px] leading-relaxed text-red-900">
                              هيتمسح <b>{c.orders} أوردر</b> و<b>{c.users} حساب</b>{" "}
                              وكل العملاء والمنتجات والمصاريف. <b>مافيش رجوع.</b>
                            </p>
                            <input
                              name="confirm_name"
                              placeholder={`اكتب: ${t.name}`}
                              className="w-full rounded-lg border border-red-300 px-2 py-1 text-[11px] text-gray-900 focus:border-red-600 focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="w-full rounded-lg bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700"
                            >
                              امسح نهائي
                            </button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== بيزنس جديد ===== */}
      <form action={createTenant} className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">بيزنس جديد</h2>
        <p className="mt-1 text-xs text-gray-500">
          هيتعمل بإعداداته الافتراضية وحساب لصاحبه بكل صلاحيات بيزنسه. بعد كده
          يدخل بنفسه ويربط بوسطة ويظبط أرقامه من صفحة الإعدادات.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className={label}>
              اسم البيزنس
            </label>
            <input id="name" name="name" required className={input} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="owner_name" className={label}>
              اسم صاحب البيزنس
            </label>
            <input id="owner_name" name="owner_name" required className={input} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className={label}>
              إيميل الدخول
            </label>
            <input id="email" name="email" type="email" required className={input} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className={label}>
              باسورد مؤقت
            </label>
            <input
              id="password"
              name="password"
              type="text"
              required
              minLength={8}
              autoComplete="off"
              className={input}
            />
            <span className="text-[11px] text-gray-400">
              8 حروف على الأقل — ابعتهاله وهو يغيّرها
            </span>
          </div>
        </div>

        {/* بيتقفل وهو بيبعت — الدوستين السريعتين كانوا بيعملوا بيزنسين */}
        <SubmitOnce
          pendingLabel="بيتعمل…"
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:bg-gray-300"
        >
          إنشاء البيزنس
        </SubmitOnce>
      </form>
    </div>
  );
}

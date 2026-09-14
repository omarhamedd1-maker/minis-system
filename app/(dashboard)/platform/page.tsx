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
  "w-full rounded-control border border-line-strong px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
const label = "text-xs text-ink-muted";

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
        <h1 className="text-lg font-bold text-ink">البيزنسات</h1>
        <p className="mt-1 text-xs text-ink-faint">
          الصفحة دي بتاعتك إنت كصاحب المنصة — مفيش عميل بيشوفها مهما كانت
          صلاحياته.
        </p>
      </div>

      {saved && (
        <p className="rounded-control bg-success-soft px-4 py-2 text-sm text-success">
          {saved}
        </p>
      )}
      {error && (
        <p className="rounded-control bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* ===== القايمة ===== */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-xs text-ink-muted">
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
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{t.name}</div>
                      <div className="text-[11px] text-ink-faint">
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
                        <span className="text-[11px] text-ink-faint">/login/</span>
                        <input
                          name="slug"
                          defaultValue={t.slug ?? ""}
                          placeholder="minis"
                          dir="ltr"
                          className="w-28 rounded-control border border-line-strong px-2 py-1 text-[11px] text-ink focus:border-primary focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-control bg-sunken px-2 py-1 text-[11px] text-ink-body hover:bg-line"
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
                        className="mt-1.5 inline-block text-[11px] font-medium text-info hover:underline"
                      >
                        بيانات البيزنس ←
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-body">{c.orders}</td>
                    <td className="px-4 py-3 text-ink-body">{c.users}</td>
                    <td className="px-4 py-3">
                      <form action={setSubscriptionEnd} className="flex items-center gap-1">
                        <input type="hidden" name="tenant_id" value={t.id} />
                        <input
                          type="date"
                          name="subscription_ends_at"
                          defaultValue={t.subscription_ends_at ?? ""}
                          className={`rounded-control border px-2 py-1 text-xs ${
                            expired
                              ? "border-danger-line bg-danger-soft text-danger"
                              : "border-line-strong text-ink"
                          }`}
                        />
                        <button
                          type="submit"
                          className="rounded-control bg-sunken px-2 py-1 text-[11px] text-ink-body hover:bg-line"
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
                              ? "bg-success-soft text-success hover:bg-success-line"
                              : "bg-sunken text-ink-muted hover:bg-line"
                          }`}
                        >
                          {t.active ? "شغال" : "موقوف"}
                        </button>
                      </form>

                      {/* **الحذف مقفول ومحتاج كتابة الاسم** — مش زرار
                          بيتداس بالغلط. وبيزنسك مالوش زرار أصلًا */}
                      {t.id !== me.tenantId && (
                        <details className="mt-2">
                          <summary className="cursor-pointer list-none text-[11px] text-ink-faint hover:text-danger">
                            حذف
                          </summary>
                          <form
                            action={deleteTenant}
                            className="mt-1.5 w-56 space-y-1.5 rounded-control bg-danger-soft p-2"
                          >
                            <input type="hidden" name="tenant_id" value={t.id} />
                            <p className="text-[10px] leading-relaxed text-danger">
                              هيتمسح <b>{c.orders} أوردر</b> و<b>{c.users} حساب</b>{" "}
                              وكل العملاء والمنتجات والمصاريف. <b>مافيش رجوع.</b>
                            </p>
                            <input
                              name="confirm_name"
                              placeholder={`اكتب: ${t.name}`}
                              className="w-full rounded-control border border-danger-line px-2 py-1 text-[11px] text-ink focus:border-danger focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="w-full rounded-control bg-danger px-2 py-1 text-[11px] font-medium text-white hover:brightness-[0.92]"
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
      <form action={createTenant} className="card p-5">
        <h2 className="text-sm font-bold text-ink">بيزنس جديد</h2>
        <p className="mt-1 text-xs text-ink-muted">
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
            <span className="text-[11px] text-ink-faint">
              8 حروف على الأقل — ابعتهاله وهو يغيّرها
            </span>
          </div>
        </div>

        {/* بيتقفل وهو بيبعت — الدوستين السريعتين كانوا بيعملوا بيزنسين */}
        <SubmitOnce
          pendingLabel="بيتعمل…"
          className="mt-4 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:bg-line-strong"
        >
          إنشاء البيزنس
        </SubmitOnce>
      </form>
    </div>
  );
}

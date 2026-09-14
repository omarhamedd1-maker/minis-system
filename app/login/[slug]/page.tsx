
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { findTenantBySlug } from "@/lib/tenant-lookup";
import { loginToStore } from "./actions";

/**
 * صفحة دخول المتجر الواحد.
 *
 * الفرق عن `/login` العادية إنها **بتقول اسم المتجر**، وبتبعت الاسم المختصر
 * مع الفورم عشان الإيميل يتبوّب بيه. الموظف اللي شغّال في متجرين بيدخل من
 * لينك كل واحد بباسورده هو.
 *
 * ولما الدومين يتشترى، `minis.الموقع.com` هيوصّل هنا من غير ما الصفحة
 * تتغيّر — الوسيط هو اللي هيترجم.
 */
export default async function StoreLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const tenant = await findTenantBySlug(createAdminClient(), slug);
  if (!tenant) notFound();

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 shadow-card">
        <h1 className="mb-1 text-center text-2xl font-bold tracking-wide text-ink">
          {tenant.name}
        </h1>
        <p className="mb-6 text-center text-sm text-ink-muted">
          تسجيل الدخول لنظام التشغيل
        </p>

        {error && (
          <div className="mb-4 rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form action={loginToStore} className="space-y-4">
          <input type="hidden" name="slug" value={tenant.slug} />

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-ink-body"
            >
              الإيميل
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-control border border-line-strong px-3 py-2 text-ink focus:border-primary focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-ink-body"
            >
              الباسورد
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-control border border-line-strong px-3 py-2 text-ink focus:border-primary focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-control bg-primary px-4 py-2 font-medium text-white transition hover:bg-primary-dark"
          >
            دخول {tenant.name}
          </button>
        </form>

        {/* **مفيش أي كلام زيادة تحت الفورم** — عمر شالهم: صفحة الدخول
            بتاعت متجر تخصّ ناسه، واللي بيدخل منها عارف هو فين. وسطر
            «الدخول العام» كان بيوديهم برّه متجرهم من غير سبب. */}
      </div>
    </div>
  );
}

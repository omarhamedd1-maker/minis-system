import Link from "next/link";
import { signup } from "./actions";

const field =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-gray-900 focus:outline-none";
const labelClass = "mb-1 block text-sm font-medium text-gray-700";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; install?: string; shop?: string }>;
}) {
  const { error, install, shop } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-center text-2xl font-bold tracking-wide text-gray-900">
          Gridpoint
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          اعمل حساب بيزنسك في دقيقة
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* **التاجر جايّ من شوبيفاي** — ركّب التطبيق والتوكن مستنّي،
            وأول ما يعمل بيزنسه بيتسلّم له. الرقم بيتمرّر مخفي عشان
            مايضيعش لو الصفحة اتعملها تحديث. */}
        {install && shop && (
          <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            متجرك <b dir="ltr">{shop}</b> اتوافق عليه ✅ — اعمل بيزنسك دلوقتي
            وهيتربط لوحده.
          </p>
        )}

        <form action={signup} className="space-y-4">
          {install && <input type="hidden" name="install" value={install} />}
          <div>
            <label htmlFor="business_name" className={labelClass}>
              اسم البيزنس
            </label>
            <input
              id="business_name"
              name="business_name"
              required
              autoComplete="organization"
              className={field}
              placeholder="متجرك"
            />
          </div>

          <div>
            <label htmlFor="owner_name" className={labelClass}>
              اسمك
            </label>
            <input
              id="owner_name"
              name="owner_name"
              required
              autoComplete="name"
              className={field}
              placeholder="الاسم اللي هيظهر في السيستم"
            />
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              الإيميل
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={field}
              placeholder="you@example.com"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="password" className={labelClass}>
              الباسورد
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={field}
              placeholder="٨ حروف على الأقل"
            />
          </div>

          <div>
            <label htmlFor="confirm" className={labelClass}>
              أكّد الباسورد
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={field}
              placeholder="اكتبه تاني"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-white transition hover:bg-gray-800"
          >
            اعمل الحساب
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          عندك حساب خلاص؟{" "}
          <Link href="/login" className="font-medium text-gray-900 underline">
            سجّل دخولك
          </Link>
        </p>
      </div>
    </div>
  );
}

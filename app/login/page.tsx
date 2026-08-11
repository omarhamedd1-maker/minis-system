import Link from "next/link";
import { goToStore } from "./actions";

/**
 * **مافيش دخول من هنا.** الصفحة دي بتسأل عن المتجر وبتوديك على بابه
 * (`/login/<المتجر>`) — وهناك بس بيتكتب الإيميل والباسورد.
 *
 * السبب في `actions.ts`: الباب العام كان بيتخطّى فحص «الحساب ده من المتجر
 * ده؟»، وكان بيخلّي كل المتاجر تدخل من نفس الصفحة بنفس الاسم.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-center text-2xl font-bold tracking-wide text-gray-900">
          MINO
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          اكتب اسم متجرك عشان نوديك لصفحة دخوله
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form action={goToStore} className="space-y-4">
          <div>
            <label
              htmlFor="store"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              اسم المتجر
            </label>
            <input
              id="store"
              name="store"
              type="text"
              required
              autoFocus
              autoComplete="organization"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-gray-900 focus:outline-none"
              placeholder="اسم متجرك أو الاسم المختصر"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 px-4 py-2 font-medium text-white transition hover:bg-gray-800"
          >
            كمّل
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          لسه مالكش حساب؟{" "}
          <Link href="/signup" className="font-medium text-gray-900 underline">
            اعمل بيزنسك
          </Link>
        </p>
      </div>
    </div>
  );
}

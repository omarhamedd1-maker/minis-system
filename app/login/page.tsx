import Link from "next/link";
import { redirect } from "next/navigation";
import { readRememberedStore } from "@/lib/store-cookie";

/**
 * **مافيش دخول من هنا، ومافيش سؤال كمان.**
 *
 * كل متجر ليه رابطه واسمه (`/login/<المتجر>`)، والصفحة دي مجرد محطة:
 * لو الجهاز فاكر آخر متجر بيوديك عليه على طول، ولو مش فاكر بتقول له
 * يفتح رابط متجره.
 *
 * قبل كده كانت باب دخول عام بياخد إيميل وباسورد من غير ما يسأل عن
 * المتجر — فكانت بتتخطّى فحص «الحساب ده من المتجر ده؟» اللي في صفحة
 * المتجر، وكانت بتخلّي كل المتاجر تدخل من نفس الصفحة بنفس الاسم.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // الجهاز فاكر متجره؟ يبقى مافيش سبب نوقفه هنا
  const slug = await readRememberedStore();
  if (slug && !error) redirect(`/login/${slug}`);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="mb-1 text-2xl font-bold tracking-wide text-gray-900">
          Gridpoint
        </h1>
        <p className="mb-6 text-sm text-gray-500">نظام تشغيل المتاجر</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <p className="rounded-lg bg-gray-50 px-4 py-5 text-sm leading-relaxed text-gray-600">
          افتح <span className="font-medium text-gray-900">رابط متجرك</span> اللي
          وصلك — كل متجر ليه صفحة دخول باسمه.
        </p>

        <p className="mt-5 text-sm text-gray-500">
          لسه مالكش حساب؟{" "}
          <Link href="/signup" className="font-medium text-gray-900 underline">
            اعمل بيزنسك
          </Link>
        </p>
      </div>
    </div>
  );
}

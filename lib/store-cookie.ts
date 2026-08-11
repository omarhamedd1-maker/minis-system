// ==========================================================================
// آخر متجر دخل منه المستخدم على الجهاز ده
// --------------------------------------------------------------------------
// **مش للتحقّق ولا للصلاحيات.** ده اسم متجر بس، عشان اللي جلسته تخلص يرجع
// لباب متجره باسمه بدل صفحة عامة. أي حد يقدر يغيّر الكوكي ومايفرقش — الدخول
// نفسه بيحصل في `/login/<المتجر>` وبيتفحص هناك.
//
// ⚠️ **الملف ده مش `"use server"` بقصد.** ملفات السيرفر مايصدّروش غير دوال
// async، فالثابت اللي تحت كان بيوقّع الصفحة كلها بـ٥٠٠ لما كان جوّه
// `actions.ts` — و`npm run check` مابيمسكش القاعدة دي.
// ==========================================================================

import { cookies } from "next/headers";

export const STORE_COOKIE = "mino_store";

const YEAR = 60 * 60 * 24 * 365;

/** الأسماء المختصرة حروف صغيرة وأرقام وشرطة بس — أي حاجة غيرها بنتجاهلها */
const SAFE_SLUG = /^[a-z0-9-]{1,40}$/;

export async function rememberStore(slug: string): Promise<void> {
  if (!SAFE_SLUG.test(slug)) return;
  const jar = await cookies();
  jar.set(STORE_COOKIE, slug, {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
  });
}

export async function readRememberedStore(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(STORE_COOKIE)?.value?.trim().toLowerCase();
  return v && SAFE_SLUG.test(v) ? v : null;
}

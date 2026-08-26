// ==========================================================================
// عنوان الويب هوك — مكان واحد بيقرر
// --------------------------------------------------------------------------
// شوبيفاي بتنادي العنوان ده لما يحصل أوردر جديد. لو العنوان غلط، الأوردر
// **مابيوصلش في لحظته** ويستنى اللفة الدورية — يعني بيشتغل، بس بطيء،
// ومحدش يعرف ليه.
//
// ⚠️⚠️ **العنوان كان بيتاخد من الصفحة اللي صاحب المتجر فاتحها** وقت الربط
// (`headers().get("host")`). يعني لو ربط من **معاينة فيرسل** — أي لينك
// فيه `-git-` أو هاش النشرة — الويب هوك بيتسجّل على نشرة مؤقتة. النشرة
// بتموت، والويب هوك بيفضل يضرب في الفاضي، والأوردرات تستنى ربع ساعة.
//
// عند ٢ سِك: **٥ أوردرات بس من ١٢ نزلوا في لحظتهم**، والوسيط ٣ ساعات —
// بينما مينيز ٥٥ من ٥٨ في **٦ ثواني**.
//
// **الملف ده صافي** — بياخد عناوين وبيرجّع العنوان الصح.
// ==========================================================================

/** الدومين اللي بيشتغل عليه الإنتاج لما مافيش إعداد */
export const FALLBACK_ORIGIN = "https://minis-system.vercel.app";

/**
 * العنوان ده معاينة مؤقتة؟
 *
 * فيرسل بتدّي كل نشرة لينك خاص بيها:
 *   `minis-system-git-<فرع>-<حساب>.vercel.app`
 *   `minis-system-<هاش>-<حساب>.vercel.app`
 *
 * ⚠️ **دول بيموتوا** — الويب هوك المسجّل عليهم بيبقى ميت معاهم.
 */
export function isPreviewHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!h.endsWith(".vercel.app")) return false;

  const name = h.slice(0, -".vercel.app".length);
  // `<مشروع>-git-<فرع>` — معاينة فرع
  if (name.includes("-git-")) return true;
  // `<مشروع>-<هاش>-<حساب>` — الهاش تسعة حروف صغيرة وأرقام
  return /-[a-z0-9]{9}-/.test(name);
}

/**
 * عنوان الويب هوك.
 *
 * ⚠️ **الترتيب مقصود**: الإعداد الثابت الأول، وبعدين عنوان الصفحة **لو
 * مش معاينة**، وبعدين الدومين المعروف. المعاينة عمرها ما تتسجّل.
 */
export function webhookOrigin(opts: {
  /** `NEXT_PUBLIC_SITE_URL` */
  configured?: string | null;
  /** `headers().get("host")` — و`null` في الكرون */
  host?: string | null;
}): string {
  const configured = String(opts.configured ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = String(opts.host ?? "").trim();
  if (host && !isPreviewHost(host)) {
    const clean = host.replace(/^https?:\/\//, "").split("/")[0];
    return `https://${clean}`;
  }

  return FALLBACK_ORIGIN;
}

/** المسار الكامل اللي شوبيفاي بتناديه */
export function webhookCallbackUrl(opts: {
  configured?: string | null;
  host?: string | null;
}): string {
  return `${webhookOrigin(opts)}/api/shopify/webhooks`;
}

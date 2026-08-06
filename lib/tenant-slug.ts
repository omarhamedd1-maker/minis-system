// ==========================================================================
// الاسم المختصر للمتجر (slug)
// --------------------------------------------------------------------------
// كل متجر بياخد اسم مختصر بالإنجليزي يبان في اللينك: `/login/minis`.
//
// **وده نفسه اللي الساب دومين هيستخدمه بعدين** (`minis.الموقع.com`) — لما
// الدومين يتشترى، الوسيط بيقرا الاسم من أول الدومين ويحوّله لنفس المسار،
// ومفيش حاجة تانية تتغيّر. فالشغل ده مش مؤقت.
//
// دوال صافية بالكامل.
// ==========================================================================

export const SLUG_MIN = 2;
export const SLUG_MAX = 32;

/**
 * أسامي محجوزة — مايتاخدوش كاسم متجر.
 *
 * سببين مختلفين:
 *   ١. **مسارات السيستم** — لو متجر اسمه `orders`، اللينك `/orders` يبقى
 *      غامض بينه وبين شاشة الأوردرات.
 *   ٢. **أسامي الساب دومين المعروفة** (`www` و`mail` و`api`) — دي هتتحجز
 *      أول ما الدومين يتشترى، وأهون إننا نمنعها دلوقتي من إننا نضطر نغيّر
 *      اسم متجر شغّال بعدين.
 */
export const RESERVED_SLUGS = [
  // مسارات السيستم
  "api", "login", "signup", "logout", "orders", "customers", "products",
  "suppliers", "expenses", "cash", "tasks", "users", "settings", "platform",
  "export", "notify", "no-access", "manifest", "icon",
  // أسامي شبكة معروفة
  "www", "mail", "smtp", "imap", "ftp", "ns", "cdn", "static", "assets",
  // أسامي عامة تلخبط
  "admin", "app", "dashboard", "support", "help", "status", "billing",
  "account", "auth", "new", "test", "demo", "minis",
];

/**
 * بيحوّل اسم البيزنس لاسم مختصر مقترح.
 *
 * ⚠️ **بيرجّع نص فاضي للأسامي العربي** — وده مقصود. الترجمة الصوتية
 * («مينيز» ← «mynyz») بتطلّع أسامي وحشة ومحدش هيرضى بيها في لينك متجره،
 * والاسم ده بيبان لعملائه. فالفاضي معناه «اسأل صاحبه»، مش «اخترع حاجة».
 */
export function slugify(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/** بيرجّع سبب الرفض بالعربي، أو `null` لو الاسم سليم */
export function checkSlug(slug: string): string | null {
  const s = String(slug ?? "").trim();

  if (!s) return "اكتب الاسم المختصر";
  if (s !== s.toLowerCase()) return "الاسم المختصر بحروف صغيرة بس";
  if (s.length < SLUG_MIN) return `الاسم المختصر لازم ${SLUG_MIN} حروف على الأقل`;
  if (s.length > SLUG_MAX) return `الاسم المختصر أطول من ${SLUG_MAX} حرف`;

  if (!/^[a-z0-9-]+$/.test(s)) {
    return "حروف إنجليزي صغيرة وأرقام وشرطة بس — مافيش عربي ولا مسافات";
  }
  if (s.startsWith("-") || s.endsWith("-")) {
    return "مايبدأش ومايخلصش بشرطة";
  }
  if (s.includes("--")) return "مافيش شرطتين ورا بعض";

  // **الرقم لوحده ممنوع** — بيتلخبط مع أرقام في اللينكات
  if (/^\d+$/.test(s)) return "مايكونش أرقام بس";

  if (RESERVED_SLUGS.includes(s)) return `«${s}» اسم محجوز — اختار غيره`;

  return null;
}

// ==========================================================================
// المواسم — التنبيه قبلها بشهر وبأسبوع
// --------------------------------------------------------------------------
// الموسم مابيفاجئش حد، بس بيعدّي على الناس وهي مش مجهّزة: البضاعة بتتطلب
// متأخر، والإعلان بيبدأ والموسم نُصّه عدّى، والمورّد بيبقى مزنوق.
//
// عمر طلب: **تنبيه قبل كل مناسبة بشهر وبأسبوع.**
//
// ⚠️⚠️ **رمضان والأعياد بالهجري، والباقي بالميلادي.** السنة الهجرية أقصر
// بـ١١ يوم، يعني رمضان بيتقدّم كل سنة — فتاريخ ثابت زي «١ مارس» بيبقى غلط
// بعد سنة، وأغلط بعد تلاتة. عشان كده التواريخ الهجرية **مكتوبة سنة بسنة**
// من التقويم مش محسوبة بقاعدة.
//
// ⚠️ **والتنبيه بيتقال مرة واحدة**: مرة قبل بشهر ومرة قبل بأسبوع. التنبيه
// اليومي بنفس الكلام بيتقفل بعد تلات مرات وبعدين اللي فيه خبر مايتقراش.
//
// **الملف ده صافي** — بياخد تاريخ وبيرجّع المواسم اللي جاية.
// ==========================================================================

/** التنبيه بيتبعت قبل الموسم بكام يوم — الاتنين */
export const NOTICE_DAYS = [30, 7] as const;

/** فرق مسموح بيه حوالين اليوم — يوم قبل ويوم بعد */
const WINDOW = 1;

export type Season = {
  key: string;
  name: string;
  /** التاريخ `2027-02-19` */
  date: string;
  /** جملة بتقول الموسم ده معناه إيه للبيع */
  note: string;
};

/**
 * المواسم اللي ليها تأثير على البيع في مصر.
 *
 * ⚠️ **التواريخ الهجرية مكتوبة بالسنة** — تقريبها بقاعدة بيغلط بيوم أو
 * اتنين، والتنبيه اللي بيجي متأخر يوم عن موسم مالوش لازمة.
 *
 * ⚠️⚠️ **ورمضان والعيد بيتأكدوا بالرؤية** — التواريخ المكتوبة هنا حسابية
 * وممكن تفرق يوم عن الإعلان الرسمي. ده مقبول لأن التنبيه بيجي **قبلها
 * بشهر وبأسبوع**، مش يوم الموسم نفسه.
 *
 * ⚠️ **والقايمة لازم تتزوّد كل سنة.** لما تخلص، الملف بيسكت — **مابيخترعش
 * تواريخ**. السكوت أحسن من تنبيه على تاريخ غلط.
 */
const SEASONS: Season[] = [
  // ===== ٢٠٢٦ =====
  { key: "back-to-school-2026", name: "دخول المدارس", date: "2026-09-20", note: "الشنط والأدوات، والصرف بيتحوّل من اللبس" },
  { key: "black-friday-2026", name: "الجمعة البيضا", date: "2026-11-27", note: "أعلى يوم خصومات في السنة — والمنافسة على الإعلان أغلى" },
  { key: "winter-2026", name: "بداية الشتا", date: "2026-12-01", note: "المنتجات الشتوي بتبدأ تتحرك" },
  { key: "new-year-2026", name: "رأس السنة", date: "2026-12-31", note: "الهدايا واللبس" },

  // ===== ٢٠٢٧ =====
  { key: "valentine-2027", name: "عيد الحب", date: "2027-02-14", note: "الهدايا الصغيرة والتغليف" },
  { key: "ramadan-2027", name: "رمضان", date: "2027-02-08", note: "الصرف بيتحوّل للأكل والبيت، والتوصيل بيبقى أبطأ" },
  { key: "eid-fitr-2027", name: "عيد الفطر", date: "2027-03-10", note: "أعلى موسم لبس في السنة — والشحن بيقف أيام العيد" },
  { key: "mothers-day-2027", name: "عيد الأم", date: "2027-03-21", note: "الهدايا — وبيتزاحم مع العيد السنة دي" },
  { key: "eid-adha-2027", name: "عيد الأضحى", date: "2027-05-17", note: "الصرف بيروح للأضحية، والبيع بيهدى قبله" },
  { key: "back-to-school-2027", name: "دخول المدارس", date: "2027-09-20", note: "الشنط والأدوات" },
  { key: "black-friday-2027", name: "الجمعة البيضا", date: "2027-11-26", note: "أعلى يوم خصومات في السنة" },
  { key: "new-year-2027", name: "رأس السنة", date: "2027-12-31", note: "الهدايا واللبس" },
];

/** اليوم بتوقيت مصر `2026-08-20` */
export function cairoDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(at);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export type Upcoming = Season & {
  /** فاضل كام يوم */
  daysAway: number;
};

/**
 * المواسم الجاية في المدة دي — للعرض في الشاشة.
 *
 * ⚠️ **اللي عدّى مابيظهرش** — «فات من ٣ أيام» مش معلومة تنفع.
 */
export function upcomingSeasons(now: Date, withinDays = 60): Upcoming[] {
  const today = cairoDay(now);
  return SEASONS.map((s) => ({ ...s, daysAway: daysBetween(today, s.date) }))
    .filter((s) => Number.isFinite(s.daysAway) && s.daysAway >= 0 && s.daysAway <= withinDays)
    .sort((a, b) => a.daysAway - b.daysAway);
}

/**
 * المواسم اللي المفروض ينزل عليها تنبيه النهاردة.
 *
 * ⚠️ **الشباك يوم قبل ويوم بعد** — الكرون ممكن يتأخر أو الخدمة تكون واقعة
 * ساعة، ولو التنبيه مربوط بيوم واحد بالظبط بيضيع خالص.
 */
export function seasonAlerts(now: Date): { season: Season; daysAway: number }[] {
  const today = cairoDay(now);
  const out: { season: Season; daysAway: number }[] = [];

  for (const s of SEASONS) {
    const away = daysBetween(today, s.date);
    if (!Number.isFinite(away)) continue;
    for (const mark of NOTICE_DAYS) {
      if (Math.abs(away - mark) <= WINDOW) {
        out.push({ season: s, daysAway: away });
        break;
      }
    }
  }

  return out.sort((a, b) => a.daysAway - b.daysAway);
}

/**
 * نص التنبيه.
 *
 * ⚠️ **بيقول الموسم ومعناه للبيع، من غير ما يقول اعمل إيه** — قرار عمر في
 * كل التنبيهات.
 */
export function seasonMessage(season: Season, daysAway: number): string {
  const when =
    daysAway <= 1
      ? "بكرة"
      : daysAway <= 8
        ? `فاضل ${daysAway} أيام`
        : `فاضل ${daysAway} يوم`;
  return [`${season.name} — ${when}`, season.note].join("\n");
}

/** آخر موسم مكتوب — عشان نعرف امتى القايمة محتاجة تتزوّد */
export function lastKnownSeason(): string {
  return SEASONS.map((s) => s.date).sort().at(-1) ?? "";
}

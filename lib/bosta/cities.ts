// ==========================================================================
// مطابقة المدينة والمنطقة من عنوان العميل
// --------------------------------------------------------------------------
// بوسطة مابتقبلش عنوان بالنص الحر — لازم رقم المدينة عندها. والعنواين عندنا
// جاية من شوبيفاي مكتوبة بأي شكل، فده الملف اللي بيترجم بينهم.
//
// دوال صافية بالكامل — مفيش شبكة ولا قاعدة بيانات، عشان تتختبر بالكامل.
// **والقرار الآمن هنا هو "مش عارف"**: لو المدينة مش واضحة بنرجّع فاضي
// والشحنة ماتتبعتش، أحسن ما تروح لمحافظة غلط.
// ==========================================================================

/** بيشيل التشكيل ويوحّد الألف والياء والتاء، وبيحوّل أي رمز لمسافة */
export function normalizeAr(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^؀-ۿ a-zA-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type BostaZone = { _id: string; name?: string; nameAr?: string };

export type BostaCity = {
  _id: string;
  name?: string;
  nameAr?: string;
  alias?: string;
  zones?: BostaZone[];
  districts?: BostaZone[];
};

/**
 * مناطق مشهورة مالهاش اسم المحافظة جوّه العنوان.
 * "التجمع الخامس، Hogcity" مافيهاش كلمة القاهرة، والشحنة كانت بتقف عندها.
 * الشمال = المنطقة زي ما بتتكتب، اليمين = اسم المحافظة عند بوسطة.
 */
const AREA_TO_CITY: [string, string][] = [
  // القاهرة
  ["التجمع", "القاهره"], ["القاهره الجديده", "القاهره"], ["new cairo", "القاهره"],
  ["fifth settlement", "القاهره"], ["الرحاب", "القاهره"], ["rehab", "القاهره"],
  ["مدينتي", "القاهره"], ["madinaty", "القاهره"], ["مصر الجديده", "القاهره"],
  ["heliopolis", "القاهره"], ["مدينه نصر", "القاهره"], ["nasr city", "القاهره"],
  ["المعادي", "القاهره"], ["maadi", "القاهره"], ["المقطم", "القاهره"],
  ["mokattam", "القاهره"], ["الزمالك", "القاهره"], ["zamalek", "القاهره"],
  ["العبور", "القاهره"], ["obour", "القاهره"], ["الشروق", "القاهره"],
  ["shorouk", "القاهره"], ["مدينه بدر", "القاهره"], ["النزهه", "القاهره"],
  ["عين شمس", "القاهره"], ["المرج", "القاهره"], ["حلوان", "القاهره"],
  ["شبرا", "القاهره"], ["وسط البلد", "القاهره"], ["العاصمه الاداريه", "القاهره"],
  // الجيزة
  ["الشيخ زايد", "الجيزه"], ["sheikh zayed", "الجيزه"], ["زايد", "الجيزه"],
  ["6 اكتوبر", "الجيزه"], ["السادس من اكتوبر", "الجيزه"], ["october", "الجيزه"],
  ["اكتوبر", "الجيزه"], ["الدقي", "الجيزه"], ["dokki", "الجيزه"],
  ["المهندسين", "الجيزه"], ["mohandessin", "الجيزه"], ["mohandiseen", "الجيزه"],
  ["العجوزه", "الجيزه"], ["agouza", "الجيزه"], ["الهرم", "الجيزه"],
  ["haram", "الجيزه"], ["فيصل", "الجيزه"], ["حدايق الاهرام", "الجيزه"],
  ["beverly hills", "الجيزه"], ["دريم لاند", "الجيزه"], ["dreamland", "الجيزه"],
  // الإسكندرية
  ["سموحه", "الاسكندريه"], ["smouha", "الاسكندريه"], ["سيدي جابر", "الاسكندريه"],
  ["ميامي", "الاسكندريه"], ["العجمي", "الاسكندريه"], ["المنتزه", "الاسكندريه"],
  ["لوران", "الاسكندريه"], ["رشدي", "الاسكندريه"], ["سان ستيفانو", "الاسكندريه"],
  ["بحري", "الاسكندريه"], ["المعموره", "الاسكندريه"], ["كليوباترا", "الاسكندريه"],
];

/** كل الأسامي اللي بوسطة بتعرف بيها المدينة (عربي، إنجليزي، واختصار) */
function cityNames(c: BostaCity): string[] {
  return [c.nameAr, c.name, c.alias].filter(Boolean) as string[];
}

/**
 * بندوّر على **أطول** اسم مدينة موجود جوّه العنوان.
 * الطول مهم: "شمال سيناء" و"سيناء" الاتنين ممكن يطابقوا، والأطول هو الأصح.
 */
function longestNameMatch(cities: BostaCity[], text: string): BostaCity | null {
  const norm = normalizeAr(text);
  if (!norm) return null;

  let best: BostaCity | null = null;
  let bestLen = 0;
  for (const c of cities) {
    for (const name of cityNames(c)) {
      const n = normalizeAr(name);
      // أقل من 3 حروف بيطابق أي حاجة بالغلط
      if (n.length >= 3 && norm.includes(n) && n.length > bestLen) {
        best = c;
        bestLen = n.length;
      }
    }
  }
  return best;
}

/**
 * المدينة من العنوان — بالاسم الأول، وبعدين بالمناطق المشهورة.
 * بترجّع `null` لو مفيش دليل كافي، ووقتها الشحنة ماتتبعتش.
 */
export function matchCity(
  cities: BostaCity[],
  address: string | null | undefined
): BostaCity | null {
  const direct = longestNameMatch(cities, address ?? "");
  if (direct) return direct;

  // مفيش اسم محافظة في العنوان — نجرّب المناطق المشهورة
  const norm = normalizeAr(address);
  if (!norm) return null;

  let areaCity: string | null = null;
  let areaLen = 0;
  for (const [area, city] of AREA_TO_CITY) {
    const a = normalizeAr(area);
    if (a.length >= 3 && norm.includes(a) && a.length > areaLen) {
      areaCity = normalizeAr(city);
      areaLen = a.length;
    }
  }
  if (!areaCity) return null;

  return (
    cities.find((c) => cityNames(c).some((n) => normalizeAr(n) === areaCity)) ??
    null
  );
}

/** المنطقة جوّه المدينة — اختيارية، بوسطة أحيانًا بتطلبها وأحيانًا لأ */
export function matchZone(
  zones: BostaZone[] | undefined,
  text: string | null | undefined
): BostaZone | null {
  if (!zones?.length) return null;
  const norm = normalizeAr(text);
  if (!norm) return null;

  let best: BostaZone | null = null;
  let bestLen = 0;
  for (const z of zones) {
    for (const name of [z.nameAr, z.name]) {
      const n = normalizeAr(name);
      if (n.length >= 3 && norm.includes(n) && n.length > bestLen) {
        best = z;
        bestLen = n.length;
      }
    }
  }
  return best;
}

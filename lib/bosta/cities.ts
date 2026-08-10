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
 * ⚠️ **بوسطة بتقبل ٢٨ محافظة بس — مفيش مدن ولا مناطق.**
 *
 * والعنوان اللي جايّ من شوبيفاي بيكون فيه اسم **المدينة** مش المحافظة:
 * «طنطا» و«Mansoura» و«Hurghada» و«التجمع الخامس». من غير الجدول ده
 * الشحنة بتقف، والموظف بيبعتها بإيده من بوسطة.
 *
 * الشمال = اللي بيتكتب في العنوان، اليمين = اسم المحافظة عند بوسطة
 * (بصيغتها المعياريه — الألف والياء والتاء موحّدين زي `normalizeAr`).
 *
 * **والأسامي الملخبطة متشالة بقصد**: «دار السلام» حي في القاهرة ومركز في
 * سوهاج، و«المطرية» حي في القاهرة ومركز في الدقهلية، و«ناصر» و«الفتح»
 * أسامي مراكز وكلمات عادية في نفس الوقت. المدينة الغلط أسوأ من إن الشحنة
 * تقف وحد يبص عليها.
 */
const AREAS_BY_CITY: Record<string, string[]> = {
  القاهره: [
    "التجمع", "التجمع الخامس", "القاهره الجديده", "new cairo", "fifth settlement",
    "5th settlement", "5th settelment", "settlement", "tagamoa", "tagamou",
    "الرحاب", "rehab", "مدينتي", "madinaty", "مصر الجديده", "heliopolis",
    "مدينه نصر", "nasr city", "المعادي", "maadi", "المقطم", "mokattam",
    "الزمالك", "zamalek", "العبور", "obour", "الشروق", "shorouk",
    "مدينه بدر", "badr city", "النزهه", "عين شمس", "المرج", "حلوان", "helwan",
    "شبرا", "وسط البلد", "downtown", "العاصمه الاداريه", "القطاميه", "katameya",
    "kattameya", "المستقبل سيتي", "mostakbal city", "future city", "المنيل",
    "manial", "مصر القديمه", "السيده زينب", "الزيتون", "حدايق القبه", "عابدين",
    "روض الفرج", "الشرابيه", "الاميريه", "التبين", "المعصره", "البساتين",
    "الوايلي", "منشيه ناصر", "الخليفه", "الماظه", "الكوربه", "رمسيس",
    "sheraton", "الشرابيه", "سراي القبه",
  ],
  الجيزه: [
    "الشيخ زايد", "sheikh zayed", "زايد", "6 اكتوبر", "السادس من اكتوبر",
    "october", "اكتوبر", "الدقي", "dokki", "المهندسين", "mohandessin",
    "mohandiseen", "العجوزه", "agouza", "الهرم", "haram", "فيصل",
    "حدايق الاهرام", "beverly hills", "دريم لاند", "dreamland", "حدايق اكتوبر",
    "hadayek october", "سفنكس", "sphinx", "بولاق الدكرور", "امبابه", "imbaba",
    "الوراق", "warraq", "المنيب", "moneeb", "صفط اللبن", "ناهيا", "كيت كات",
    "الطالبيه", "العمرانيه", "بين السرايات", "البدرشين", "العياط", "الحوامديه",
    "اوسيم", "كرداسه", "ابو النمرس", "منشاه القناطر", "الواحات البحريه",
  ],
  الاسكندريه: [
    "سموحه", "smouha", "سيدي جابر", "sidi gaber", "ميامي", "العجمي", "agami",
    "المنتزه", "montaza", "لوران", "رشدي", "سان ستيفانو", "san stefano",
    "بحري", "المعموره", "كليوباترا", "cleopatra", "سيدي بشر", "المندره",
    "العصافره", "محرم بك", "كفر عبده", "ستانلي", "stanley", "جليم", "glim",
    "برج العرب", "borg el arab", "ابو قير", "الدخيله", "العامريه",
  ],
  الغربيه: [
    "طنطا", "tanta", "المحله الكبري", "المحله", "mahalla", "mehalla",
    "كفر الزيات", "زفتي", "سمنود", "بسيون", "قطور", "السنطه",
  ],
  الدقهليه: [
    "المنصوره", "mansoura", "mansura", "ميت غمر", "mit ghamr", "طلخا",
    "دكرنس", "السنبلاوين", "بلقاس", "شربين", "اجا", "منيه النصر",
    "تمي الامديد", "المنزله", "جمصه", "gamasa", "نبروه", "ميت سلسيل",
  ],
  "البحر الاحمر": [
    "الغردقه", "hurghada", "ghardaka", "سفاجا", "safaga", "مرسي علم",
    "marsa alam", "القصير", "quseer", "راس غارب", "الجونه", "el gouna",
    "gouna", "سهل حشيش", "sahl hasheesh", "مكادي", "makadi", "شلاتين",
  ],
  "جنوب سيناء": [
    "شرم الشيخ", "sharm el sheikh", "sharm", "دهب", "dahab", "نويبع",
    "nuweiba", "طابا", "taba", "سانت كاترين", "saint catherine", "الطور",
    "راس سدر", "ras sedr", "sedr",
  ],
  "شمال سيناء": ["العريش", "arish", "بير العبد", "الشيخ زويد", "رفح", "rafah"],
  الشرقيه: [
    "الزقازيق", "zagazig", "بلبيس", "belbeis", "العاشر من رمضان",
    "10th of ramadan", "منيا القمح", "فاقوس", "ابو حماد", "ههيا", "ابو كبير",
    "ديرب نجم", "مشتول السوق", "الصالحيه", "كفر صقر", "الحسينيه", "اولاد صقر",
  ],
  القليوبيه: [
    "بنها", "benha", "شبرا الخيمه", "shubra el kheima", "قليوب", "qalyub",
    "الخانكه", "القناطر الخيريه", "طوخ", "كفر شكر", "الخصوص", "شبين القناطر",
  ],
  المنوفيه: [
    "شبين الكوم", "shebin el kom", "منوف", "اشمون", "مدينه السادات",
    "sadat city", "تلا", "بركه السبع", "قويسنا", "الباجور", "سرس الليان",
  ],
  البحيره: [
    "دمنهور", "damanhour", "كفر الدوار", "kafr el dawwar", "رشيد", "rosetta",
    "ادكو", "edku", "ابو المطامير", "الدلنجات", "حوش عيسي", "ايتاي البارود",
    "شبراخيت", "وادي النطرون", "wadi el natrun", "النوباريه", "ابو حمص",
    "المحموديه", "كوم حماده", "بدر البحيره",
  ],
  "كفر الشيخ": [
    "كفر الشيخ", "kafr el sheikh", "دسوق", "desouk", "بلطيم", "baltim",
    "فوه", "مطوبس", "سيدي سالم", "الحامول", "بيلا", "قلين", "سيدي غازي",
  ],
  دمياط: [
    "دمياط", "damietta", "راس البر", "ras el bar", "فارسكور", "كفر سعد",
    "الزرقا", "ميت ابو غالب", "دمياط الجديده", "new damietta", "عزبه البرج",
  ],
  "بور سعيد": ["بورسعيد", "بور سعيد", "port said", "portsaid", "بورفؤاد", "port fouad"],
  الاسماعيليه: [
    "الاسماعيليه", "ismailia", "فايد", "fayed", "القنطره", "التل الكبير",
    "ابو صوير", "القصاصين", "سرابيوم",
  ],
  السويس: [
    "السويس", "suez", "العين السخنه", "ain sokhna", "sokhna", "عتاقه",
    "الجناين", "الاربعين", "بورتوفيق",
  ],
  الفيوم: [
    "الفيوم", "fayoum", "fayyum", "سنورس", "اطسا", "طاميه", "ابشواي",
    "يوسف الصديق", "تونس الفيوم",
  ],
  "بني سويف": [
    "بني سويف", "beni suef", "bani sweif", "الواسطي", "ببا", "الفشن",
    "سمسطا", "اهناسيا", "بياض العرب",
  ],
  المنيا: [
    "المنيا", "minya", "menya", "ملوي", "mallawi", "بني مزار", "مغاغه",
    "سمالوط", "مطاي", "ابو قرقاص", "دير مواس", "العدوه", "ملوي الجديده",
  ],
  اسيوط: [
    "اسيوط", "assiut", "asyut", "ديروط", "dairut", "منفلوط", "manfalut",
    "ابنوب", "القوصيه", "ابو تيج", "صدفا", "البداري", "ساحل سليم", "الغنايم",
  ],
  سوهاج: [
    "سوهاج", "sohag", "اخميم", "akhmim", "جرجا", "girga", "طهطا", "tahta",
    "المراغه", "البلينا", "ساقلته", "جهينه", "المنشاه", "دار السلام سوهاج",
  ],
  قنا: [
    "قنا", "qena", "نجع حمادي", "nag hammadi", "دشنا", "قوص", "قفط",
    "ابو تشت", "فرشوط", "نقاده",
  ],
  الاقصر: [
    "الاقصر", "luxor", "اسنا", "esna", "ارمنت", "الطود", "البياضيه",
    "القرنه", "الزينيه",
  ],
  اسوان: [
    "اسوان", "aswan", "كوم امبو", "kom ombo", "ادفو", "edfu", "دراو",
    "نصر النوبه", "ابو سمبل", "abu simbel",
  ],
  "مرسي مطروح": [
    "مرسي مطروح", "marsa matrouh", "matrouh", "الضبعه", "سيدي براني",
    "السلوم", "سيوه", "siwa", "النجيله", "فوكه",
  ],
  "الساحل الشمالي": [
    "الساحل الشمالي", "north coast", "الساحل", "مارينا", "marina",
    "سيدي عبد الرحمن", "sidi abdel rahman", "العلمين", "alamein", "هاسيندا",
    "hacienda", "مراسي", "marassi", "تلال", "telal", "الماسه", "لافيستا",
    "la vista", "امواج", "amwaj", "دايموند", "diamond", "جايا", "gaia",
    "سيلفر ساندز", "silver sands", "المنتزه الساحل",
  ],
  "الوادي الجديد": [
    "الخارجه", "kharga", "الداخله", "dakhla", "الفرافره", "farafra", "بلاط",
  ],
};

/** نفس الجدول مفرود: [اللي في العنوان، اسم المحافظة] */
const AREA_TO_CITY: [string, string][] = Object.entries(AREAS_BY_CITY).flatMap(
  ([city, areas]) => areas.map((area) => [area, city] as [string, string])
);

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

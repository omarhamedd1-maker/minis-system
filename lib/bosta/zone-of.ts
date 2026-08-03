// ==========================================================================
// المحافظة ← منطقة التسعير
// --------------------------------------------------------------------------
// بوسطة بتسعّر بسبع مناطق، وكل منطقة جواها محافظات. الشحنة بتيجي معاها اسم
// المحافظة، فمحتاجين نحوّله لمنطقة عشان نعرف سعرها.
//
// **الأسماء بتتقارن بعد تنظيف** — الألف والياء والتاء المربوطة والـ"ال"،
// لأن نفس المحافظة بتيجي بأشكال مختلفة من بوسطة ومن شوبيفاي ومن العميل
// (الجيزة / الجيزه / Giza / الجيزى).
//
// الملف صافي — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

import type { PricingZone } from "./pricing";

/** بيوحّد الاسم عشان المقارنة تنفع */
export function normalizeGovernorate(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ةه]/g, "ه")
    .replace(/^ال/, "")
    .replace(/\s+/g, "");
}

/** كل منطقة ومحافظاتها — بالعربي والإنجليزي */
const ZONE_MEMBERS: Record<PricingZone, string[]> = {
  cairo_giza: ["القاهرة", "الجيزة", "cairo", "giza", "gizeh", "6thofoctober", "6october"],
  alex_beheira: ["الإسكندرية", "البحيرة", "alexandria", "alex", "beheira", "behira"],
  delta_canal: [
    "الدقهلية", "القليوبية", "الغربية", "كفر الشيخ", "المنوفية", "الشرقية",
    "دمياط", "الإسماعيلية", "بورسعيد", "السويس",
    "dakahlia", "qalyubia", "kaliobia", "gharbia", "kafrelsheikh", "menofia",
    "sharqia", "damietta", "ismailia", "portsaid", "suez",
  ],
  north_saeed: [
    "الفيوم", "بني سويف", "المنيا", "أسيوط", "سوهاج",
    "fayoum", "banisuef", "benisuef", "minya", "assiut", "sohag",
  ],
  south_saeed: [
    "قنا", "الأقصر", "أسوان", "البحر الأحمر", "مطروح",
    "qena", "luxor", "aswan", "redsea", "matrouh", "matrooh",
  ],
  north_coast: ["الساحل الشمالي", "northcoast", "sahel"],
  sinai_wadi: [
    "شمال سيناء", "جنوب سيناء", "الوادي الجديد",
    "northsinai", "southsinai", "newvalley", "sinai",
  ],
};

/** فهرس مبني مرة واحدة */
const INDEX = new Map<string, PricingZone>();
for (const [zone, names] of Object.entries(ZONE_MEMBERS) as [
  PricingZone,
  string[],
][]) {
  for (const name of names) INDEX.set(normalizeGovernorate(name), zone);
}

/**
 * منطقة التسعير من اسم المحافظة.
 *
 * **بيرجّع `null` لو مالقاش** — مابنحطّهاش على القاهرة افتراضيًا، لأن ده
 * بيخلّي شحنة سيناء (١٢٧) تتحسب بسعر القاهرة (٨١) ومحدش ياخد باله. الأحسن
 * إن الحسبة تقول "مش عارف" وتتصلّح.
 */
export function zoneOfGovernorate(
  raw: string | null | undefined
): PricingZone | null {
  const name = normalizeGovernorate(raw);
  if (!name) return null;

  const exact = INDEX.get(name);
  if (exact) return exact;

  // الاسم جاي جوّه عنوان كامل؟ ندوّر على أطول اسم متطابق
  let best: { zone: PricingZone; length: number } | null = null;
  for (const [key, zone] of INDEX) {
    if (key.length >= 3 && name.includes(key)) {
      if (!best || key.length > best.length) best = { zone, length: key.length };
    }
  }
  return best?.zone ?? null;
}

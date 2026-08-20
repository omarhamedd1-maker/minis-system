// ==========================================================================
// بتبيع فين فعلًا — المناطق من العناوين
// --------------------------------------------------------------------------
// خانة «المدينة» فاضية عند مينيز: **عميل واحد من ٣٠٨** فيه مدينة مكتوبة.
// يعني أي تقسيم جغرافي مبني عليها هيبقى صفحة فاضية.
//
// ⚠️⚠️ **بس العنوان نفسه فيه المنطقة** — ٣٢٣ من ٣٢٤ أوردر عنوانهم مكتوب،
// وجوّاه «٦ اكتوبر» و«Sheikh zayed» و«New Cairo». فالمنطقة بتتقرا من
// العنوان، مش من خانة فاضية.
//
// ⚠️ **واللي مالوش منطقة بيتعرض كـ«مش معروف» مش بيتقسم على الباقي.** لو
// وزّعناه، أرقام كل منطقة تبقى أكبر من الحقيقة وإحنا مش واخدين بالنا.
//
// ⚠️ **والمقارنة بين المناطق محتاجة أرقام**: منطقة فيها أوردرين رجع منهم
// واحد = ٥٠٪ رجوع. النسبة مابتتعرضش تحت `MIN_FOR_RATE`.
//
// **الملف ده صافي** — بياخد عناوين وبيرجّع مناطق.
// ==========================================================================

/** أقل عدد أوردرات في المنطقة عشان نسبة الرجوع يبقى ليها معنى */
export const MIN_FOR_RATE = 8;

/**
 * بيوحّد النص عشان المقارنة تنفع مهما اتكتب إزاي.
 *
 * ⚠️⚠️ **الأرقام بتتحوّل الأول قبل مسح التشكيل.**
 *
 * التشكيل العربي مداه `U+064B` لحد `U+0670` — و**الأرقام العربي جوّه المدى
 * ده** (`٠` = `U+0660`). يعني المدى الواسع بيمسح «٦» من «٦ اكتوبر» قبل ما
 * تبقى «6»، والعنوان يفضل «اكتوبر» ومايطابقش المفتاح أبدًا.
 *
 * ده اتكشف على عنوان حقيقي: «ماونتن فيو ٤ … ٦ اكتوبر Giza» كان بيتحسب
 * **الجيزة** بدل ٦ أكتوبر. المدى دلوقتي محصور في التشكيل بس.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ةه]/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * المناطق اللي بندوّر عليها — **بالترتيب**.
 *
 * ⚠️⚠️ **الترتيب مهم جدًا.** «New Cairo» جوّاها كلمة «Cairo»، فلو دوّرنا
 * على القاهرة الأول كل التجمع هيتحسب القاهرة. الأخص بيتشاف الأول دايمًا.
 */
const AREAS: { label: string; keys: string[] }[] = [
  // ===== القاهرة الكبرى — الأخص الأول =====
  { label: "التجمع والقاهرة الجديدة", keys: ["new cairo", "التجمع", "قطامية", "katameya", "rehab", "الرحاب", "madinaty", "مدينتي"] },
  { label: "٦ أكتوبر والشيخ زايد", keys: ["6 october", "6th of october", "sixth of october", "6 اكتوبر", "السادس من اكتوبر", "sheikh zayed", "shiekh zayed", "الشيخ زايد", "زايد", "beverly hills", "mountain view"] },
  { label: "المعادي", keys: ["maadi", "المعادي"] },
  { label: "مصر الجديدة ومدينة نصر", keys: ["heliopolis", "مصر الجديده", "nasr city", "مدينه نصر", "الشروق", "shorouk", "obour", "العبور"] },
  { label: "الجيزة", keys: ["giza", "gizeh", "الجيزه", "الهرم", "haram", "faisal", "فيصل", "الدقي", "dokki", "mohandessin", "المهندسين"] },
  { label: "القاهرة", keys: ["cairo", "القاهره", "مصر القديمه", "شبرا", "shubra", "المرج", "حلوان", "helwan"] },
  { label: "القليوبية", keys: ["qalyubia", "kaliobia", "القليوبيه", "بنها", "banha", "شبين القناطر"] },

  // ===== باقي مصر =====
  { label: "الإسكندرية", keys: ["alexandria", "alex", "الاسكندريه", "سموحه", "smouha", "ميامي", "سيدي بشر"] },
  { label: "الساحل الشمالي", keys: ["north coast", "الساحل الشمالي", "sahel", "مارينا", "marina", "العلمين", "alamein"] },
  { label: "الدلتا", keys: ["dakahlia", "الدقهليه", "المنصوره", "mansoura", "gharbia", "الغربيه", "طنطا", "tanta", "المحله", "mahalla", "menofia", "المنوفيه", "شبين الكوم", "kafr el sheikh", "كفر الشيخ", "damietta", "دمياط", "البحيره", "beheira", "دمنهور"] },
  { label: "الشرقية والقناة", keys: ["sharqia", "الشرقيه", "الزقازيق", "zagazig", "ismailia", "الاسماعيليه", "port said", "بورسعيد", "suez", "السويس"] },
  { label: "الصعيد", keys: ["fayoum", "الفيوم", "beni suef", "بني سويف", "minya", "المنيا", "assiut", "اسيوط", "sohag", "سوهاج", "qena", "قنا", "luxor", "الاقصر", "aswan", "اسوان"] },
  { label: "البحر الأحمر وسيناء", keys: ["red sea", "البحر الاحمر", "hurghada", "الغردقه", "sharm", "شرم", "دهب", "dahab", "sinai", "سيناء", "matrouh", "مطروح", "مرسي مطروح"] },
];

/** الفهرس متبني مرة واحدة — النص المنظّف مقابل الاسم */
const INDEX = AREAS.map((a) => ({
  label: a.label,
  keys: a.keys.map(norm).filter(Boolean),
}));

/** اسم المنطقة اللي مذكورة في العنوان — و`null` لو مافيش */
export function areaOf(address: string | null | undefined): string | null {
  const text = norm(String(address ?? ""));
  if (!text) return null;
  for (const a of INDEX) {
    for (const k of a.keys) {
      if (text.includes(k)) return a.label;
    }
  }
  return null;
}

export type MapOrder = {
  address: string | null;
  orderStatus: string | null;
  /** إجمالي الأوردر */
  total: number;
};

export type AreaRow = {
  area: string;
  orders: number;
  /** اللي خلص — تسليم أو رجوع */
  settled: number;
  returned: number;
  /** نسبة الرجوع — و`null` لو الأرقام قليلة */
  returnRate: number | null;
  /** فلوس اللي وصل */
  delivered: number;
};

export type OrderMap = {
  rows: AreaRow[];
  /** أوردرات معرفناش منطقتها */
  unknown: number;
  /** المنطقة اللي بتبيع فيها أكتر */
  top: AreaRow | null;
  /** ⚠️ أوحش منطقة في الرجوع — من اللي عندها أرقام كفاية */
  worst: AreaRow | null;
};

const RETURNED = ["returned", "returned_after_delivery"];
const SETTLED = ["delivered", "returned", "returned_after_delivery"];

export function orderMap(orders: MapOrder[]): OrderMap {
  const by = new Map<string, AreaRow>();
  let unknown = 0;

  for (const o of orders) {
    const area = areaOf(o.address);
    if (!area) {
      unknown++;
      continue;
    }

    const row =
      by.get(area) ??
      ({
        area,
        orders: 0,
        settled: 0,
        returned: 0,
        returnRate: null,
        delivered: 0,
      } as AreaRow);

    const status = String(o.orderStatus);
    row.orders++;
    if (SETTLED.includes(status)) row.settled++;
    if (RETURNED.includes(status)) row.returned++;
    if (status === "delivered") row.delivered += Math.max(0, Number(o.total) || 0);

    by.set(area, row);
  }

  const rows = [...by.values()].map((r) => ({
    ...r,
    // ⚠️ **النسبة من اللي خلص مش من كل الأوردرات** — اللي لسه في السكة
    // لسه ممكن يرجع، وحطّه في المقام بيصغّر النسبة كل يوم.
    returnRate:
      r.settled >= MIN_FOR_RATE
        ? Math.round((r.returned / r.settled) * 1000) / 10
        : null,
  }));

  rows.sort((a, b) => b.orders - a.orders);

  const rated = rows.filter((r) => r.returnRate !== null);
  rated.sort((a, b) => (b.returnRate ?? 0) - (a.returnRate ?? 0));

  return {
    rows,
    unknown,
    top: rows[0] ?? null,
    worst: rated[0] && (rated[0].returnRate ?? 0) > 0 ? rated[0] : null,
  };
}

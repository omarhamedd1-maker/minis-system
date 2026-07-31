// ==========================================================================
// ملف التكاليف — نزّل، اكتب في إكسيل، ارفع
// --------------------------------------------------------------------------
// شوبيفاي مافيهاش تكلفة، فكل منتج بييجي منها بتكلفة صفر. وتعبئة ٨٤ منتج
// واحد واحد من الشاشة شغل يوم — الملف بيخلّيها ربع ساعة.
//
// **حاجتين لازم يتعملوا صح عشان إكسيل العربي يشتغل:**
//
//   ١. الملف بيبدأ بـBOM. من غيره إكسيل بيقرا UTF-8 على إنه ANSI والأسماء
//      العربية بتطلع رموز.
//   ٢. الفاصل **فاصلة منقوطة** مش فاصلة. ويندوز العربي بيفتح CSV بالفاصلة
//      المنقوطة، وبالفاصلة العادية بيحط الصف كله في خانة واحدة.
//
// **والمعرف عمود مخفي المعنى** — بيه بنعرف الشكل حتى لو الاسم أو الكود
// اتغيّر. لو حد مسحه أو غيّره، السطر بيترفض بدل ما يتحط على منتج غلط.
//
// الملف ده صافي — مافيش شبكة ولا قاعدة بيانات، فينفع يتختبر.
// ==========================================================================

export const COST_FILE_SEPARATOR = ";";

export const COST_FILE_HEADERS = [
  "المعرف",
  "الكود",
  "المنتج",
  "الشكل",
  "سعر البيع",
  "التكلفة",
] as const;

export type CostFileRow = {
  variantId: string;
  sku: string | null;
  productName: string;
  variantName: string | null;
  salePrice: number;
  costPrice: number;
};

/** بيهرب الخانة لو فيها فاصلة منقوطة أو علامة تنصيص أو سطر جديد */
function cell(value: string | number | null): string {
  const s = String(value ?? "");
  if (s.includes(COST_FILE_SEPARATOR) || s.includes('"') || /[\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** بيبني نص الملف — **بيبدأ بـBOM عشان إكسيل يقرا العربي صح** */
export function buildCostFile(rows: CostFileRow[]): string {
  const lines = [COST_FILE_HEADERS.map(cell).join(COST_FILE_SEPARATOR)];

  for (const r of rows) {
    lines.push(
      [
        r.variantId,
        r.sku ?? "",
        r.productName,
        r.variantName ?? "",
        r.salePrice,
        // الصفر بيتساب فاضي عشان العميل يلاقي الخانة مستنياه
        r.costPrice > 0 ? r.costPrice : "",
      ]
        .map(cell)
        .join(COST_FILE_SEPARATOR)
    );
  }

  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** بيقسّم سطر CSV مع احترام علامات التنصيص */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === COST_FILE_SEPARATOR) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * الأرقام العربية بتتحوّل لإنجليزي، والفاصلة العشرية العربية كمان.
 * حد بيكتب في إكسيل العربي «١٢٠٠» أو «1,200» — الاتنين لازم يتقبلوا.
 */
export function parseNumber(raw: string): number | null {
  const cleaned = String(raw ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫،]/g, ".")
    .replace(/[,\s]/g, "")
    .replace(/جنيه/g, "")
    .trim();

  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type CostFilePlan = {
  /** هيتغيّروا فعلًا */
  updates: { variantId: string; name: string; from: number; to: number }[];
  /** التكلفة زي ما هي */
  unchanged: number;
  /** الخانة سايبها فاضية — بنعدّيها، مش بنصفّرها */
  blank: number;
  /** معرف مش موجود عندنا */
  unknown: { line: number; variantId: string }[];
  /** رقم مش مظبوط أو سالب */
  invalid: { line: number; reason: string }[];
};

export type KnownVariant = { name: string; costPrice: number };

/**
 * بيقرا الملف المرفوع ويطلّع الخطة.
 *
 * **مابيصفّرش حاجة.** الخانة الفاضية معناها "سيبها زي ما هي" مش "خليها صفر"،
 * لأن أغلب الناس بتملا الناقص بس وتسيب الباقي.
 */
export function parseCostFile(
  text: string,
  known: Map<string, KnownVariant>
): CostFilePlan {
  const plan: CostFilePlan = {
    updates: [],
    unchanged: 0,
    blank: 0,
    unknown: [],
    invalid: [],
  };

  const body = String(text ?? "").replace(/^﻿/, "");
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return plan;

  // نتخطى سطر العناوين لو موجود
  const first = splitLine(lines[0]);
  const start = first[0] === COST_FILE_HEADERS[0] ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const cols = splitLine(lines[i]);
    const variantId = cols[0] ?? "";
    if (!variantId) continue;

    const target = known.get(variantId);
    if (!target) {
      plan.unknown.push({ line: lineNo, variantId });
      continue;
    }

    const raw = cols[5] ?? "";
    if (raw === "") {
      plan.blank++;
      continue;
    }

    const value = parseNumber(raw);
    if (value === null) {
      plan.invalid.push({ line: lineNo, reason: `"${raw}" مش رقم` });
      continue;
    }
    if (value < 0) {
      plan.invalid.push({ line: lineNo, reason: "التكلفة مينفعش تبقى بالسالب" });
      continue;
    }

    if (Math.abs(value - target.costPrice) < 0.01) {
      plan.unchanged++;
      continue;
    }

    plan.updates.push({
      variantId,
      name: target.name,
      from: target.costPrice,
      to: value,
    });
  }

  return plan;
}

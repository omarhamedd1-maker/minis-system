/**
 * ==========================================================================
 * قراية إيميل التحويل (TRANSFERS §٢ · الخطوة ٥)
 * --------------------------------------------------------------------------
 * بوسطة بتبعت «Cashout Receipt» بعد كل تحويل، وفيه:
 *
 *   رقم الفاتورة   SUNCOD06SEP26
 *   التاريخ        06 Sep, 2026
 *   مبلغ التحويل   ٣,٦٧١٫٦٣
 *   دورات التحصيل  ٣,٧٧٩ لـ٣ أوردرات
 *   رسوم بوسطة     ١٠٧٫٣٧
 *
 * **والعدد هو الفرق بين الإيميل والكشف** — كشف المحفظة مافيهوش عدد
 * الأوردرات، فالربط بالأوردرات بيشتغل من هنا بس (قرار ١٨ سبتمبر).
 *
 * ⚠️ **السماح هنا صفر.** الإيميل بيدّي الرقم الصحيح بالقرش، فمفيش تقريب
 * زي الحركات اليدوية (`ROUNDING_TOLERANCE` للاستيراد التاريخي بس).
 *
 * ⚠️ **اللي مايتقراش مايتخمّنش** — بيرجع سببه، والإيميل بيتسجّل زي ما هو
 * في `courier_payout_emails` عشان يتشاف.
 *
 * **الملف ده صافي** — بياخد نص وبيرجّع أرقام.
 * ==========================================================================
 */

import { parseAmount, parseDate } from "./payout-statement";

export type PayoutEmail = {
  invoiceNumber: string;
  /** YYYY-MM-DD */
  date: string;
  gross: number;
  fees: number;
  net: number;
  orderCount: number | null;
};

export type EmailParse =
  | { ok: true; payout: PayoutEmail }
  | { ok: false; reason: string };

/** الإيميل بيوصل HTML — النص اللي جوّه هو اللي بيتقرا */
export function emailText(raw: string): string {
  return String(raw ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|td|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t ]+/g, " ")
    // ⚠️ المسافة حوالين السطر بتخلي «١٠٠» تبقى « ١٠٠» فالمقارنة تفشل
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** رقم الفاتورة: تلات حروف + COD + يوم + شهر + سنة (SUNCOD06SEP26) */
const INVOICE = /\b([A-Z]{3}COD\d{2}[A-Z]{3}\d{2})\b/;

/** الأسامي اللي بتسبق كل رقم — عربي وإنجليزي */
const LABELS = {
  // ⚠️ «Transfer Amount» هو الاسم الحقيقي في القسم الإنجليزي من إيميل
  // بوسطة — اتشاف في `MONCOD21SEP26`، وماكانش في القايمة
  net: [
    "مبلغ التحويل",
    "الصافي",
    "transfer amount",
    "cashout amount",
    "cash-out amount",
    "net amount",
    "amount transferred",
    "transferred amount",
  ],
  gross: ["دورات التحصيل", "التحصيل", "cod collected", "collected amount", "cod cycles", "total cod"],
  fees: ["رسوم بوسطة", "الرسوم", "bosta fees", "fees", "charges"],
  date: ["التاريخ", "date", "cashout date"],
};

/**
 * ⚠️⚠️ **أول رقم في النص بس.** «٣,٧٧٩ لـ٣ أوردرات» فيه رقمين، واللي بياخد
 * كل الأرقام وبيلزقها كان بيطلّع ٣٧,٧٩٣ — رقم مالوش وجود.
 */
function firstAmount(text: string | null): number | null {
  if (!text) return null;
  const m = /[\d٠-٩][\d٠-٩.,٫٬]*/.exec(text);
  return m ? parseAmount(m[0]) : null;
}

/** بيدوّر على السطر اللي فيه الاسم وياخد الرقم اللي بعده */
function valueFor(lines: string[], names: string[]): string | null {
  for (const line of lines) {
    const low = line.toLowerCase();
    const hit = names.find((n) => low.includes(n.toLowerCase()));
    if (!hit) continue;
    const after = line.slice(low.indexOf(hit.toLowerCase()) + hit.length);
    if (after.trim()) return after.trim();
    // الاسم في سطر والقيمة في اللي بعده (جدول HTML)
    const next = lines[lines.indexOf(line) + 1];
    if (next && next.trim()) return next.trim();
  }
  return null;
}

/**
 * عدد الأوردرات — **وده المفتاح اللي بيخلّي الربط بالأوردرات يشتغل**.
 *
 * ⚠️⚠️ **بوسطة بتترجم «orders» لـ«أمرًا»**، والريجيكس القديم كان بيدوّر
 * على «أوردر/شحن/طلب» بس. النتيجة: `MONCOD21SEP26` اتسجّل بمبلغه الصح
 * و**صفر أوردرات** — والمطابقة من غير عدد بترجع لـ«أقدم N» اللي مالهاش
 * معنى وسط ٢٤١ أوردر مش مربوط.
 *
 * الشكل الحقيقي (٢١ سبتمبر): «دورات التحصيل النقدي ٥٨١٦ جنيه **بالنسبة
 * لـ ٣ أمرًا**» · والإنجليزي «For 3 deposited orders».
 *
 * ⚠️ **والأسامي بتتقري بالبادئة** — «أمرًا» و«أمرا» و«أوامر» كلهم `أمر`.
 */
function orderCountFrom(text: string): number | null {
  const ar = /(?:لـ|ل)\s*([\d٠-٩]+)\s*(?:أوردر|اوردر|أمر|امر|أوامر|اوامر|شحن|طلب)/.exec(text);
  const en = /\bfor\s+(\d+)\s+(?:deposited\s+|delivered\s+)?(?:orders?|shipments?)\b/i.exec(text);
  const raw = ar?.[1] ?? en?.[1];
  if (!raw) return null;
  const n = parseAmount(raw);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

export function parsePayoutEmail(raw: string): EmailParse {
  const text = emailText(raw);
  if (!text) return { ok: false, reason: "الإيميل فاضي" };

  const invoice = INVOICE.exec(text)?.[1] ?? null;
  if (!invoice) return { ok: false, reason: "مالقيناش رقم الفاتورة في الإيميل" };

  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const net = firstAmount(valueFor(lines, LABELS.net));
  if (net === null) return { ok: false, reason: "مالقيناش مبلغ التحويل" };

  const gross = firstAmount(valueFor(lines, LABELS.gross));
  const fees = firstAmount(valueFor(lines, LABELS.fees));

  // التاريخ من السطر، ولو مش موجود فمن رقم الفاتورة نفسه (06SEP26)
  const date = parseDate(valueFor(lines, LABELS.date) ?? "") ?? dateFromInvoice(invoice);
  if (!date) return { ok: false, reason: "مالقيناش تاريخ التحويل" };

  return {
    ok: true,
    payout: {
      invoiceNumber: invoice,
      date,
      // الإيميل ساعات بيدّي الصافي والرسوم بس
      gross: gross ?? Math.round((net + (fees ?? 0)) * 100) / 100,
      fees: fees ?? 0,
      net,
      orderCount: orderCountFrom(text),
    },
  };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * ⚠️ **رقم الفاتورة نفسه فيه التاريخ** — `SUNCOD06SEP26` = ٦ سبتمبر ٢٠٢٦.
 * ده بديل لو سطر التاريخ اتغيّر شكله، مش مصدر أساسي.
 */
export function dateFromInvoice(invoice: string): string | null {
  const m = /^[A-Z]{3}COD(\d{2})([A-Z]{3})(\d{2})$/.exec(invoice);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]);
  if (month < 0) return null;
  return `20${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]}`;
}

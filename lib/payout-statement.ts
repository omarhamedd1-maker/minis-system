/**
 * ==========================================================================
 * قراية كشف محفظة شركة الشحن (TRANSFERS §٩ · الخطوة ٣)
 * --------------------------------------------------------------------------
 * الكشف بينزل من لوحة بوسطة كملف (CSV أو Excel اتحفظ CSV)، وفيه كل
 * التحويلات من أكتوبر ٢٠٢٥. رفعة واحدة بتربط التاريخ كله.
 *
 * ⚠️ **الأعمدة بتتعرف بالاسم مش بالترتيب** — الملف بيتغيّر من نسخة للتانية،
 * والقراية بالترتيب بتقلب المبلغ بالرسوم من غير ما حد يشوف. واللي مش
 * متعرّف بيترمي بسببه مش بيتخمّن.
 *
 * ⚠️ **الصف اللي ناقصه رقم فاتورة أو مبلغ مابيتقراش** — التحويل من غير رقم
 * مالوش مفتاح، وبيتكرر في كل رفعة.
 *
 * **الملف ده صافي** — بياخد نص وبيرجّع صفوف.
 * ==========================================================================
 */

export type StatementRow = {
  invoiceNumber: string;
  /** YYYY-MM-DD */
  date: string;
  gross: number;
  fees: number;
  net: number;
  orderCount: number | null;
  /** رقم السطر في الملف — عشان الخطأ يتقال بمكانه */
  line: number;
};

export type StatementProblem = { line: number; reason: string; raw: string };

/** سطر من دفتر الحركات مش تحويل — رسوم أو تعويض أو تحصيل */
export type LedgerLine = {
  /** `Transactions ID` — المفتاح اللي بيمنع التكرار بين الرفعات */
  txnId: string;
  /** YYYY-MM-DD */
  date: string;
  /** زي ما بوسطة كتباه: `Bosta Fees Cycle` … */
  category: string;
  /** بإشارته زي ما هي في الكشف — السالب مصروف والموجب دخل */
  amount: number;
};

export type Statement = {
  rows: StatementRow[];
  problems: StatementProblem[];
  /** الأعمدة اللي اتعرفت — بتتعرض في المعاينة */
  columns: Partial<Record<Field, string>>;
  /**
   * ⚠️⚠️ **بنود الكشف الكامل** — بتتملي بس لما يكون فيه عمود `Category`
   * (§٧.١). الملف المقصوص بيرجّعها فاضية، ودي كانت السنة اللي خلّتنا
   * نقول «الكشف مافيهوش رسوم».
   */
  ledger: LedgerLine[];
};

type Field = "invoice" | "date" | "gross" | "fees" | "net" | "count" | "category";

/** أسماء الأعمدة المعروفة — عربي وإنجليزي، بأي حالة أحرف */
const HEADERS: Record<Field, string[]> = {
  invoice: ["invoice", "invoice number", "invoice no", "reference", "transactions id", "transaction id", "رقم الفاتورة", "الفاتورة", "المرجع", "رقم الحركة"],
  date: ["date", "payout date", "transfer date", "التاريخ", "تاريخ التحويل"],
  gross: ["cod", "collected", "cod amount", "gross", "دورات التحصيل", "التحصيل", "المحصّل", "المحصل"],
  fees: ["fees", "fee", "bosta fees", "charges", "رسوم", "رسوم بوسطة", "الرسوم"],
  net: ["net", "amount", "transferred", "payout", "مبلغ التحويل", "الصافي", "المحوّل", "المحول"],
  count: ["orders", "order count", "count", "عدد الأوردرات", "الأوردرات", "عدد الشحنات"],
  // ⚠️ **العمود ده هو الفرق بين الكشف الكامل والمقصوص** — لما يكون
  // موجود، الملف دفتر حركات مش قايمة تحويلات (§٧.١)
  category: ["category", "type", "transaction type", "النوع", "التصنيف", "نوع الحركة"],
};

const clean = (s: string) => s.replace(/^﻿/, "").replace(/^"|"$/g, "").trim();

/** بيفصل السطر بالفاصلة أو التاب — ومحترم علامات الاقتباس */
export function splitRow(line: string): string[] {
  const sep = line.includes("\t") && !line.includes(",") ? "\t" : ",";
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === sep && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(clean);
}

/** الأرقام العربية والفاصلة العربية → الشكل الغربي */
function westernize(raw: string): string {
  return clean(raw)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

/** «١,٢٣٤٫٥٦» أو «1,234.56 EGP» → 1234.56 · و`null` لو مش رقم */
export function parseAmount(raw: string): number | null {
  const western = westernize(raw);
  const digits = western.replace(/[^\d.\-]/g, "");
  if (!digits || !/\d/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** «06 Sep, 2026» · «2026-09-06» · «06/09/2026» → YYYY-MM-DD */
export function parseDate(raw: string): string | null {
  // ⚠️ التاريخ كمان بيجي بأرقام عربية في الكشف العربي
  const t = westernize(raw);
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = /^(\d{1,2})\s*([A-Za-z]{3,})[,\s]+(\d{4})/.exec(t);
  if (named) {
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (m >= 0) return `${named[3]}-${String(m + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  // ⚠️ **يوم/شهر/سنة** — الكشف مصري، واللبس بين ٠٦/٠٩ و٠٩/٠٦ بيتحسم للمصري
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(t);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;

  // ⚠️ **رقم إكسل التسلسلي** (46275 = ١٠ سبتمبر ٢٠٢٦) — بيطلع لما الكشف
  // يتحفظ CSV من إكسل من غير تنسيق. **بحدود ضيقة بقصد**: ٤٠٠٠٠ لـ٦٠٠٠٠
  // (٢٠٠٩ → ٢٠٦٤)، عشان رقم عادي مايتقراش كأنه تاريخ.
  const serial = /^\d{5}(\.\d+)?$/.exec(t);
  if (serial) {
    const n = Number(t);
    if (n >= 40000 && n <= 60000) {
      return new Date(Math.round((n - 25569) * 86_400_000)).toISOString().slice(0, 10);
    }
  }
  return null;
}

function matchHeader(cell: string): Field | null {
  const c = cell.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [field, names] of Object.entries(HEADERS) as [Field, string[]][]) {
    if (names.some((n) => c === n)) return field;
  }
  for (const [field, names] of Object.entries(HEADERS) as [Field, string[]][]) {
    if (names.some((n) => c.includes(n))) return field;
  }
  return null;
}

export function parseStatement(text: string): Statement {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd());
  const problems: StatementProblem[] = [];
  const rows: StatementRow[] = [];

  // أول سطر فيه عمودين معروفين على الأقل هو الترويسة
  let headerAt = -1;
  let map: Partial<Record<Field, number>> = {};
  const columns: Partial<Record<Field, string>> = {};
  for (let i = 0; i < lines.length && headerAt < 0; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitRow(lines[i]);
    const found: Partial<Record<Field, number>> = {};
    cells.forEach((cell, idx) => {
      const f = matchHeader(cell);
      if (f && found[f] === undefined) {
        found[f] = idx;
        columns[f] = cell;
      }
    });
    if (Object.keys(found).length >= 2) {
      headerAt = i;
      map = found;
    }
  }

  if (headerAt < 0) {
    return { rows: [], problems: [{ line: 1, reason: "مالقيناش سطر عناوين الأعمدة", raw: lines[0] ?? "" }], columns, ledger: [] };
  }
  /**
   * ⚠️⚠️ **الكشف الكامل دفتر حركات مش قايمة تحويلات.** لما يكون فيه عمود
   * `Category`، كل سطر بيبقى حركة واحدة: التحويل نفسه (`Cash Out`)، أو
   * رسوم، أو تحصيل، أو تعويض. فالقراية بتتغيّر بالكامل:
   *
   *   `Cash Out`  ← تحويل (المبلغ بالسالب، بناخد قيمته المطلقة)
   *   الباقي       ← بنود بتتخزّن زي ما هي وبتتصنّف في `lib/courier-fees.ts`
   */
  const isLedger = map.category !== undefined;
  if (isLedger) return parseLedger(lines, headerAt, map, columns);

  for (const need of ["invoice", "net"] as Field[]) {
    if (map[need] === undefined) {
      problems.push({
        line: headerAt + 1,
        reason: need === "invoice" ? "مفيش عمود رقم الفاتورة" : "مفيش عمود مبلغ التحويل",
        raw: lines[headerAt],
      });
    }
  }
  if (problems.length > 0) return { rows: [], problems, columns, ledger: [] };

  const at = (cells: string[], f: Field) => {
    const i = map[f];
    return i === undefined ? "" : (cells[i] ?? "");
  };

  for (let i = headerAt + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = splitRow(raw);
    const invoice = at(cells, "invoice");
    const net = parseAmount(at(cells, "net"));
    const line = i + 1;

    // ⚠️ **سطر المجموع في آخر الكشف** فيه كلمة زي Total من غير رقم فاتورة
    // حقيقي. ورقم الفاتورة الحقيقي دايمًا فيه أرقام (SUNCOD06SEP26).
    if (!invoice || !/\d/.test(westernize(invoice))) {
      problems.push({ line, reason: "مفيش رقم فاتورة", raw });
      continue;
    }
    if (net === null) {
      problems.push({ line, reason: "المبلغ مش رقم", raw });
      continue;
    }
    const date = parseDate(at(cells, "date"));
    if (!date) {
      problems.push({ line, reason: "التاريخ مش مقروء", raw });
      continue;
    }
    const gross = parseAmount(at(cells, "gross"));
    const fees = parseAmount(at(cells, "fees"));
    const count = parseAmount(at(cells, "count"));

    rows.push({
      invoiceNumber: invoice,
      date,
      // الكشف ساعات بيدّي الصافي بس — والتحصيل ساعتها = الصافي + الرسوم
      gross: gross ?? Math.round((net + (fees ?? 0)) * 100) / 100,
      fees: fees ?? 0,
      net,
      orderCount: count !== null && Number.isInteger(count) && count > 0 ? count : null,
      line,
    });
  }

  // ⚠️ نفس رقم الفاتورة مرتين في نفس الملف = التاني بيتشال
  const seen = new Set<string>();
  const unique: StatementRow[] = [];
  for (const r of rows) {
    if (seen.has(r.invoiceNumber)) {
      problems.push({ line: r.line, reason: `رقم الفاتورة ${r.invoiceNumber} متكرر في الملف`, raw: "" });
      continue;
    }
    seen.add(r.invoiceNumber);
    unique.push(r);
  }

  return { rows: unique, problems, columns, ledger: [] };
}

/** التصنيف اللي معناه «ده تحويل» في دفتر الحركات */
const CASH_OUT = ["cash out", "cashout", "تحويل", "صرف"];

/**
 * قراية دفتر الحركات (الكشف الكامل · ٨ أعمدة).
 *
 * ⚠️ **التحويل سطر والرسوم سطور تانية** — مش أعمدة في نفس السطر. فالصف
 * بتاع `Cash Out` بيدّي الصافي بس، والتحصيل والرسوم بيتجمّعوا من بنود
 * منفصلة (§٧.١).
 *
 * ⚠️ **والمبالغ بإشارتها**: التحويل والرسوم بالسالب، والتحصيل والتعويض
 * بالموجب. بنسيبها زي ما هي في البنود عشان التصنيف يعرف يفرّق.
 */
function parseLedger(
  lines: string[],
  headerAt: number,
  map: Partial<Record<Field, number>>,
  columns: Partial<Record<Field, string>>
): Statement {
  const problems: StatementProblem[] = [];
  const rows: StatementRow[] = [];
  const ledger: LedgerLine[] = [];
  const at = (cells: string[], f: Field) => {
    const i = map[f];
    return i === undefined ? "" : (cells[i] ?? "");
  };

  for (let i = headerAt + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = splitRow(raw);
    const line = i + 1;
    const id = at(cells, "invoice");
    const category = at(cells, "category").trim();
    const amount = parseAmount(at(cells, "net"));
    const date = parseDate(at(cells, "date"));

    if (!category) continue; // سطر فاضي أو مجموع
    if (!id || amount === null || !date) {
      problems.push({ line, reason: "سطر ناقص (رقم أو مبلغ أو تاريخ)", raw });
      continue;
    }

    if (CASH_OUT.includes(category.toLowerCase())) {
      rows.push({
        invoiceNumber: id,
        date,
        // ⚠️ التحصيل والرسوم مش في السطر ده — بيتجمّعوا من البنود
        gross: Math.abs(amount),
        fees: 0,
        net: Math.abs(amount),
        orderCount: null,
        line,
      });
    } else {
      ledger.push({ txnId: id, date, category, amount });
    }
  }

  // ⚠️ نفس رقم التحويل مرتين في نفس الملف = التاني بيتشال
  const seen = new Set<string>();
  const unique: StatementRow[] = [];
  for (const r of rows) {
    if (seen.has(r.invoiceNumber)) {
      problems.push({ line: r.line, reason: `رقم التحويل ${r.invoiceNumber} متكرر في الملف`, raw: "" });
      continue;
    }
    seen.add(r.invoiceNumber);
    unique.push(r);
  }

  return { rows: unique, problems, columns, ledger };
}

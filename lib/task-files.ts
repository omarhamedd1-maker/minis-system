// ==========================================================================
// مرفقات التاسك — الصور وملفات الإثبات
// --------------------------------------------------------------------------
// الملفات في bucket **مقفول** اسمه `task-files`، والقراية بروابط موقّتة من
// السيرفر بس. صورة إثبات شغل ممكن يبقى فيها عنوان عميل أو فاتورة، فلينك
// مفتوح للأبد مش حاجة كويسة.
//
// المسار: `<tenant>/<task>/<uuid>.<امتداد>` — البيزنس في أول المسار عشان
// يبقى واضح لمين، والاسم عشوائي عشان اسم الملف الأصلي مايبقاش مسار.
// ==========================================================================

export type TaskFile = { path: string; name: string };

/** الأنواع اللي بنقبلها — صور وPDF بس */
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

/** أكبر ملف — ٨ ميجا. الصورة من الموبايل عادةً ٢–٤ */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export type FileCheck = { ok: true } | { ok: false; error: string };

export function checkFile(f: { type: string; size: number }): FileCheck {
  if (f.size <= 0) return { ok: false, error: "الملف فاضي" };
  if (f.size > MAX_FILE_BYTES) {
    return { ok: false, error: "الملف كبير — أقصى حجم ٨ ميجا" };
  }
  if (!ALLOWED.includes(f.type)) {
    return { ok: false, error: "الصور وملفات PDF بس" };
  }
  return { ok: true };
}

/**
 * الامتداد من اسم الملف — **من الاسم مش من النوع**، وبنقصّه عشان اسم زي
 * `x.jpg.exe` مايعديش امتداد غريب في المسار.
 */
export function safeExtension(name: string): string {
  const m = String(name ?? "").toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : "bin";
}

/** مسار التخزين — عشوائي بالكامل، اسم الملف الأصلي بيتخزّن جنبه بس */
export function storagePath(
  tenantId: string,
  taskId: string,
  fileName: string,
  uuid: string
): string {
  return `${tenantId}/${taskId}/${uuid}.${safeExtension(fileName)}`;
}

/**
 * المرفق ده تبع التاسك ده فعلًا؟
 *
 * **الفحص ده هو اللي بيمنع حد يقرا مرفق بيزنس تاني** بإنه يبعت مسار من
 * عنده. مانعتمدش على إن المسار جاي من الشاشة.
 */
export function ownsFile(
  attachments: TaskFile[],
  path: string
): boolean {
  return attachments.some((a) => a.path === path);
}

import { issueWindowNote } from "@/lib/issues-since";

/**
 * «فيه حاجات متخفية» — السطر اللي بيبان في شاشات المشاكل.
 *
 * ⚠️ **الصفحة اللي بتخفي من غير ما تقول بتكدب بالصمت** (DESIGN قاعدة ٨).
 * الفلتر ده إعداد (`tenant_credentials.issues_since`)، فاللي بيبص على
 * الشاشة لازم يعرف إنه شغّال وإن فيه أوردرات برّه العدّ.
 *
 * مابيظهرش خالص لو مفيش تاريخ أو مفيش حاجة اتخفت.
 */
export function IssuesSinceNote({
  since,
  hidden,
  scope,
}: {
  since: string | null | undefined;
  hidden: number;
  /**
   * الأقسام اللي الفلتر واقع عليها — للشاشة اللي **مش كلها** بتتفلتر
   * (صحة التشغيل: أقسام المشاكل بتتفلتر والنِّسَب لأ).
   */
  scope?: string;
}) {
  const note = issueWindowNote(since, hidden);
  if (!note) return null;
  return (
    <p className="text-xs text-ink-faint">
      {note}
      {scope ? ` (${scope})` : ""}
    </p>
  );
}

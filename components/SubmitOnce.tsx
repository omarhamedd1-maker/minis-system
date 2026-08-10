"use client";

import { useFormStatus } from "react-dom";

/**
 * زرار بيتقفل وهو بيبعت.
 *
 * **الدوستين السريعتين كانوا بيعملوا بيزنسين.** الأكشن بيعمل تحويل في
 * الآخر، بس التحويل بييجي بعد ما الشغل يخلص — والدوسة التانية بتكون
 * اتبعتت خلاص. الحاجز التاني في السيرفر (الاسم المكرر بيترفض)، وده
 * الحاجز الأول اللي بيمنعها من الأساس.
 */
export function SubmitOnce({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "ثانية…") : children}
    </button>
  );
}

/**
 * الرصيد — الرقم الأساسي في صفحة الفلوس (MONEY ٧.١).
 * الرقم كبير والعملة صغيرة جنبه، والسالب بالأحمر وبعلامته.
 */
export function BalanceFigure({ balance }: { balance: number }) {
  const negative = balance < 0;
  const number = new Intl.NumberFormat("en-EG", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Math.abs(balance));

  return (
    <div className="pb-2 text-end">
      <p className="text-[11px] font-medium text-ink-muted">الرصيد الحالي</p>
      <p
        className={`mt-0.5 flex items-baseline justify-end gap-1.5 leading-none ${
          negative ? "text-danger" : "text-ink"
        }`}
      >
        <span className="text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
          {negative && "−"}
          {number}
        </span>
        <span className="text-sm font-medium text-ink-muted">جنيه</span>
      </p>
    </div>
  );
}

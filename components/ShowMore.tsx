import Link from "next/link";
import { SHOW_MAX, SHOW_STEP } from "@/lib/show-more";
import { AutoLoadMore } from "@/components/AutoLoadMore";

/**
 * زرار «عرض المزيد» — مكوّن واحد لكل القوايم.
 *
 * بيزوّد `show` في اللينك بس، فالصفحة بتعيد التحميل بعدد أكبر. اللينك بيحمل
 * باقي الفلاتر معاه عشان ما يرجّعش الصفحة لأولها.
 */
export function ShowMore({
  basePath,
  query = {},
  shown,
  total,
  step = SHOW_STEP,
  auto = false,
}: {
  basePath: string;
  /** باقي الفلاتر — عشان الضغط ما يضيّعهاش */
  query?: Record<string, string | undefined>;
  /** المعروض دلوقتي */
  shown: number;
  /** الإجمالي الموجود — سيبه فاضي لو مش معروف (زي الأوردرات) */
  total?: number;
  step?: number;
  /**
   * يجيب اللي بعدهم لوحده وانت نازل (`AutoLoadMore`).
   *
   * ⚠️ **الافتراضي إطفا** — القوايم اللي صفوفها تقيلة (أو اللي بتتطبع)
   * تفضل بدوسة. الأوردرات بس دلوقتي (ORDERS §٥).
   */
  auto?: boolean;
}) {
  if (total !== undefined && shown >= total) return null;
  // ⚠️ فوق الألف مابنقدرش نعرض أكتر في صفحة واحدة — بنقول كده بدل زرار مابيعملش حاجة
  if (shown >= SHOW_MAX) {
    return (
      <p className="mt-4 text-center text-xs text-ink-muted">
        دي أول {SHOW_MAX.toLocaleString("en-EG")} — ضيّق بالفلاتر عشان تشوف الباقي
      </p>
    );
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
  params.set("show", String(shown + step));

  const label =
    total !== undefined ? `عرض المزيد (باقي ${total - shown})` : "عرض المزيد";

  if (auto) {
    return <AutoLoadMore href={`${basePath}?${params.toString()}`} label={label} />;
  }

  return (
    <div className="mt-4 flex justify-center">
      <Link
        scroll={false}
        href={`${basePath}?${params.toString()}`}
        className="rounded-control bg-surface px-6 py-2 text-sm font-medium text-ink-body shadow-card hover:bg-sunken"
      >
        عرض المزيد
        {total !== undefined && ` (باقي ${total - shown})`}
      </Link>
    </div>
  );
}

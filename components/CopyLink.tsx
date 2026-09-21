"use client";

import { useState } from "react";

/**
 * لينك مع زرار نسخ.
 *
 * **اللينك ده بيتبعت للتيم**، فالنسخ بضغطة أهم من إنه يبان كامل — التحديد
 * بالإيد على التليفون بياخد نص دقيقة وبيجيب معاه مسافة زيادة.
 */
export function CopyLink({
  url,
  href,
  hideUrl = false,
}: {
  url: string;
  href?: string;
  /**
   * الرابط نفسه مايتعرضش — زرار النسخ بس (ORDER §٦).
   *
   * ⚠️ **للروابط اللي بتتبعت مش اللي بتتقرا**: لينك التتبع طوله سطر كامل
   * من حروف مالهاش معنى لحد، وبياخد كرت كامل عشان حاجة فعلها دوسة واحدة.
   */
  hideUrl?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // المتصفح رافض النسخ؟ اللينك نفسه لسه ظاهر ويتحدد بالإيد
    }
  };

  return (
    <div
      className={
        hideUrl
          ? "flex items-center gap-1"
          : "mt-1.5 flex items-center gap-1 rounded-control bg-sunken px-2 py-1"
      }
    >
      {/*
        **من غير `href` بيبقى نص مش لينك.** فيه روابط مالهاش لازمة تتفتح —
        زي رابط الويب هوك: هو بيستقبل `POST` بس، فالضغط عليه بيفتح صفحة
        خطأ ٤٠٥ وبيخلّي اللي ضغط يفتكر إن فيه حاجة بايظة.
      */}
      {hideUrl ? null : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className="min-w-0 flex-1 truncate text-[11px] text-ink-muted hover:text-info hover:underline"
          title={url}
        >
          {url}
        </a>
      ) : (
        <span
          dir="ltr"
          className="min-w-0 flex-1 truncate text-[11px] text-ink-muted"
          title={url}
        >
          {url}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        title="انسخ اللينك"
        aria-label="انسخ اللينك"
        className={`shrink-0 transition ${
          hideUrl
            ? "inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line-strong px-3 py-1.5 text-xs font-medium"
            : "rounded-chip px-1.5 py-1"
        } ${
          copied
            ? "bg-success-line text-success"
            : hideUrl
              ? "text-ink-body hover:bg-sunken"
              : "text-ink-faint hover:bg-line hover:text-ink-body"
        }`}
      >
        {hideUrl && <span>{copied ? "اتنسخ" : "نسخ"}</span>}
        {copied ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
    </div>
  );
}

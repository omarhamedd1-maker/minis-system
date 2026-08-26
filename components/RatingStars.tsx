"use client";

import { useState, useTransition } from "react";

type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * نجوم التقييم.
 *
 * ⚠️ **خانة الكلام بتظهر بعد ما يختار** — الفورم اللي بيبدأ بمربع كتابة
 * كبير بيخوّف، والتقييم كله المفروض يخلص في ثانية.
 *
 * ⚠️ **وإنجليزي** زي صفحة التتبع — نفس العميل.
 */
export function RatingStars({
  orderId,
  save,
}: {
  orderId: string;
  save: (formData: FormData) => Promise<SaveResult>;
}) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="mt-8 text-sm leading-relaxed text-gray-600">
        Thank you — we got it.
      </p>
    );
  }

  const shown = hover || stars;

  return (
    <form
      className="mt-8"
      action={(formData) => {
        setError(null);
        formData.set("order_id", orderId);
        formData.set("stars", String(stars));
        start(async () => {
          const r = await save(formData);
          if (r.ok) setDone(true);
          else setError(r.error);
        });
      }}
    >
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} out of 5`}
            className={`text-4xl leading-none transition-transform active:scale-90 ${
              n <= shown ? "text-amber-400" : "text-gray-200"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      {stars > 0 && (
        <>
          <textarea
            name="comment"
            rows={3}
            maxLength={500}
            placeholder="Anything you'd like to add? (optional)"
            className="mt-6 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />

          <button
            disabled={pending}
            className="mt-3 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}

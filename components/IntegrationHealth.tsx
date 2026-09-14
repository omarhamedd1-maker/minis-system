"use client";

import { useState, useTransition } from "react";
import type { LinkCard, LinkState } from "@/lib/integration-health";
import { anyDown, healthLine } from "@/lib/integration-health";

const DOT: Record<LinkState, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  down: "bg-danger",
  off: "bg-line-strong",
};

const WORD: Record<LinkState, string> = {
  ok: "شغّالة",
  warn: "فيها ملاحظة",
  down: "مش رادّة",
  off: "مش مربوطة",
};

/**
 * زرار بيسأل شوبيفاي وبوسطة ويعرض ردّهم.
 *
 * ⚠️ **بالضغط مش لوحده** — الفحص بيكلّم الطرفين، ولو واحد فيهم واقع
 * الاستنى بيبقى على الصفحة كلها.
 */
export function IntegrationHealth({
  check,
}: {
  check: () => Promise<LinkCard[]>;
}) {
  const [cards, setCards] = useState<LinkCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">صحة الوصلات</h2>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {cards
              ? healthLine(cards)
              : "«مافيش أوردرات» و«الوصلة مقطوعة» شكلهم واحد لحد ما حد يسأل."}
          </p>
        </div>
        <button
          onClick={() => {
            setFailed(false);
            start(async () => {
              try {
                setCards(await check());
              } catch {
                setFailed(true);
              }
            });
          }}
          disabled={pending}
          className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "بيسأل…" : cards ? "افحص تاني" : "افحص دلوقتي"}
        </button>
      </div>

      {failed && (
        <p className="mt-3 text-xs text-danger">الفحص نفسه مانفعش يتعمل.</p>
      )}

      {cards && (
        <div className="mt-4 space-y-3">
          {cards.map((c) => (
            <div key={c.key} className="rounded-control bg-sunken px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${DOT[c.state]}`} />
                <span className="text-sm font-medium text-ink">
                  {c.label}
                </span>
                <span className="text-xs text-ink-muted">{WORD[c.state]}</span>
              </div>
              <div className="mt-1.5 space-y-0.5 pr-4">
                {c.checks.map((x) => (
                  <div
                    key={x.label}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="text-ink-muted">{x.label}</span>
                    <span
                      className={
                        x.state === "down"
                          ? "text-danger"
                          : x.state === "warn"
                            ? "text-warning"
                            : "text-ink-muted"
                      }
                      dir="auto"
                    >
                      {x.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {anyDown(cards) && (
            <p className="text-[11px] leading-relaxed text-danger">
              الوصلة اللي مش رادّة معناها إن الداتا اللي بتشوفها واقفة عند آخر
              مرة نجحت فيها — مش إن الشغل هدي.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

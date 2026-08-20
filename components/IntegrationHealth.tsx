"use client";

import { useState, useTransition } from "react";
import type { LinkCard, LinkState } from "@/lib/integration-health";
import { anyDown, healthLine } from "@/lib/integration-health";

const DOT: Record<LinkState, string> = {
  ok: "bg-green-500",
  warn: "bg-amber-500",
  down: "bg-red-500",
  off: "bg-gray-300",
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
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">صحة الوصلات</h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
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
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "بيسأل…" : cards ? "افحص تاني" : "افحص دلوقتي"}
        </button>
      </div>

      {failed && (
        <p className="mt-3 text-xs text-red-600">الفحص نفسه مانفعش يتعمل.</p>
      )}

      {cards && (
        <div className="mt-4 space-y-3">
          {cards.map((c) => (
            <div key={c.key} className="rounded-lg bg-gray-50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${DOT[c.state]}`} />
                <span className="text-sm font-medium text-gray-900">
                  {c.label}
                </span>
                <span className="text-xs text-gray-500">{WORD[c.state]}</span>
              </div>
              <div className="mt-1.5 space-y-0.5 pr-4">
                {c.checks.map((x) => (
                  <div
                    key={x.label}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="text-gray-500">{x.label}</span>
                    <span
                      className={
                        x.state === "down"
                          ? "text-red-600"
                          : x.state === "warn"
                            ? "text-amber-700"
                            : "text-gray-600"
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
            <p className="text-[11px] leading-relaxed text-red-600">
              الوصلة اللي مش رادّة معناها إن الداتا اللي بتشوفها واقفة عند آخر
              مرة نجحت فيها — مش إن الشغل هدي.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

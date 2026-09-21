"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { searchTarget } from "@/components/HeaderSearch";

const KEY = "minis:last-search:orders";
/** التخزين مش بيبلّغ التبويب اللي غيّره — فبنبلّغ بإيدنا */
const EVENT = "minis-last-search";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function readSaved(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && v.trim() ? v : null;
  } catch {
    // المتصفح اللي قافل التخزين مايوقّعش الصفحة
    return null;
  }
}

/**
 * ==========================================================================
 * آخر بحث — **اقتراح مش تطبيق** (ORDERS-PAGE-REDESIGN §٥ · الخطوة ٩)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **`/orders` نضيف = كل الأوردرات دايمًا.** عمر بيبعت اللينك ده
 * لموظفين، فلو الصفحة فتحت على بحث محفوظ الموظف بيشوف جزء من الشغل وهو
 * فاكر إنه شايف الكل — ومحدش هيلاحظ، لأن الصفحة مش هتقول إنها مفلترة
 * (نفس منطق قاعدة ٨ في DESIGN).
 *
 * فاللي بيتحفظ بيبان **كشريحة تتداس** بس.
 *
 * ⚠️ **التخزين مصدر برّاني، فبيتقرا بـ`useSyncExternalStore`** مش بحالة
 * بتتحط جوّه `useEffect` — ده اللي بيخلي الشريحة تختفي فورًا لما تشيلها
 * أو تدوّر، من غير رندر زيادة.
 *
 * والتخزين في المتصفح نفسه: البحث حاجة شخصية لمين قاعد على الجهاز، مش
 * إعداد للبيزنس.
 * ==========================================================================
 */
export function LastSearchHint({ current }: { current: string }) {
  const saved = useSyncExternalStore(subscribe, readSaved, () => null);

  // البحث الشغّال دلوقتي هو اللي يتحفظ لبعدين
  useEffect(() => {
    if (!current) return;
    try {
      window.localStorage.setItem(KEY, current);
    } catch {
      return;
    }
    window.dispatchEvent(new Event(EVENT));
  }, [current]);

  // فيه بحث شغّال؟ الشريحة بتاعته ظاهرة أصلًا في شريط الفلاتر
  if (current || !saved) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Link
        href={searchTarget("/orders", window.location.search, saved)}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sunken px-3 py-1 text-xs text-ink-muted hover:bg-line hover:text-ink"
      >
        آخر بحث: <span className="font-medium text-ink-body">{saved}</span>
      </Link>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.removeItem(KEY);
          } catch {
            return;
          }
          window.dispatchEvent(new Event(EVENT));
        }}
        aria-label="انسى آخر بحث"
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs text-ink-faint hover:bg-sunken hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

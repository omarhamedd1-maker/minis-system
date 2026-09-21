"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OPEN_SEARCH } from "@/components/HeaderSearch";

/**
 * ==========================================================================
 * اختصارات الكيبورد في قايمة الأوردرات (ORDERS §٥ · الخطوة ١١)
 * --------------------------------------------------------------------------
 * `/` بحث · `N` أوردر جديد · `↑↓` تنقل · `Enter` فتح · `Esc` إلغاء التحديد.
 *
 * ⚠️⚠️ **مابيشتغلش وانت بتكتب.** أي خانة أو قايمة أو نص قابل للتعديل =
 * الحرف بيروح لها. من غير الشرط ده، كتابة اسم فيه «ن» في خانة البحث كانت
 * هتفتح صفحة أوردر جديد وتضيّع اللي كتبته.
 *
 * ⚠️ **والتنقل على اللي ظاهر بس** — الكروت (موبايل) والجدول (ديسكتوب)
 * الاتنين في الصفحة، وواحد منهم متخفي بالـCSS. `offsetParent` بيفرّق.
 *
 * ⚠️ **العلامة مؤقتة ومابتتخزّنش** — دي مكان المؤشر دلوقتي، مش حالة
 * الأوردر. علامة «آخر أوردر فتحته» حاجة تانية خالص
 * (`components/LastOpenedOrder.tsx`).
 * ==========================================================================
 */

const CURSOR = ["ring-2", "ring-primary/60"];

export function OrderKeys() {
  const router = useRouter();

  useEffect(() => {
    /** الصفوف الظاهرة بالترتيب — الكروت أو الجدول حسب عرض الشاشة */
    const rows = () =>
      [...document.querySelectorAll<HTMLElement>("[data-order-id]")].filter(
        (el) => el.offsetParent !== null
      );

    const clear = () => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-key-cursor]")) {
        el.classList.remove(...CURSOR);
        el.removeAttribute("data-key-cursor");
      }
    };

    const move = (step: number) => {
      const list = rows();
      if (list.length === 0) return;
      const at = list.findIndex((el) => el.hasAttribute("data-key-cursor"));
      // مفيش مؤشر؟ الأول من فوق مهما كان اتجاه السهم
      const next = at < 0 ? 0 : Math.min(Math.max(at + step, 0), list.length - 1);
      clear();
      const el = list[next];
      el.setAttribute("data-key-cursor", "1");
      el.classList.add(...CURSOR);
      el.scrollIntoView({ block: "nearest" });
    };

    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      return Boolean(el.closest?.("input, textarea, select, [contenteditable='true']"));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing(e.target)) return;

      if (e.key === "/") {
        e.preventDefault();
        document.dispatchEvent(new Event(OPEN_SEARCH));
        return;
      }
      // `N` بالإنجليزي و`ن` بالعربي — الكيبورد بيتقلب وانت شغال
      if (e.key === "n" || e.key === "N" || e.key === "ن") {
        e.preventDefault();
        router.push("/orders/new");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
        return;
      }
      if (e.key === "Enter") {
        // زرار أو لينك واقف عليه بالتاب؟ الـEnter بتاعه هو، مش بتاعنا
        const on = document.activeElement as HTMLElement | null;
        if (on?.closest?.("button, a")) return;
        const el = document.querySelector<HTMLElement>("[data-key-cursor]");
        const id = el?.getAttribute("data-order-id");
        if (!id) return;
        e.preventDefault();
        router.push(`/orders/${id}`);
        return;
      }
      if (e.key === "Escape") clear();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clear();
    };
  }, [router]);

  return null;
}

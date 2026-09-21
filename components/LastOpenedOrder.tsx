"use client";

import { useEffect } from "react";

const KEY = "minis:last-order";

/**
 * ==========================================================================
 * آخر أوردر فتحته — علامة خفيفة لما ترجع للقايمة (ORDERS §٥ · الخطوة ٩)
 * --------------------------------------------------------------------------
 * بتفتح أوردر، ترجع، وتدوّر بعينك على اللي كنت فيه. العلامة بتقول لك
 * **مكانك** — مش حالة ولا تنبيه.
 *
 * ⚠️ **خفيفة بقصد**: إطار رفيع بلون الحد، مش لون دلالي. اللون الدائم
 * الوحيد في الكارت هو شارة الحالة (ORDERS §٢ج) — وعلامة مكان بلون أخضر
 * أو أحمر بتتقري غلط.
 *
 * ⚠️ **وبتتشال بعد أول رجعة** — علامة بتفضل أيام بتبقى زحمة، والصفحة اللي
 * كل حاجة فيها معلّمة زي اللي مفيهاش علامات.
 * ==========================================================================
 */

/** بيتحط في صفحة الأوردر الواحد — بيسجّل إنك كنت هنا */
export function RememberOpenedOrder({ orderId }: { orderId: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, orderId);
    } catch {
      /* التخزين مقفول = مفيش علامة، والصفحة زي ما هي */
    }
  }, [orderId]);
  return null;
}

/**
 * بيتحط في القايمة — بيدوّر على الكارت/السطر ويحط عليه العلامة.
 *
 * ⚠️ **بيلمس الـDOM بإيده بقصد**: القايمة بتترسم على السيرفر، والسيرفر
 * مايعرفش تخزين المتصفح. البديل كان إن كل كارت يبقى مكوّن عميل — تمن
 * كبير علشان إطار.
 */
export function MarkLastOpenedOrder() {
  useEffect(() => {
    let id: string | null = null;
    try {
      id = window.localStorage.getItem(KEY);
      if (id) window.localStorage.removeItem(KEY);
    } catch {
      return;
    }
    if (!id) return;
    const marks = document.querySelectorAll<HTMLElement>(
      `[data-order-id="${CSS.escape(id)}"]`
    );
    for (const el of marks) {
      el.classList.add("ring-1", "ring-line-strong");
    }
  }, []);
  return null;
}

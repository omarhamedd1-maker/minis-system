// ==========================================================================
// التحصيل عندنا ضد التحصيل عند بوسطة
// --------------------------------------------------------------------------
// السيستم بيدفع التحصيل لبوسطة **بس لما تعدّل أوردر من الشاشة**. لو الرقم
// اختلف لأي سبب تاني (حد عدّل في بوسطة، شحنة جزئية، تعديل مافيش) مفيش حاجة
// بتكتشف — والفحص لقى ١٥ أوردر بفرق ١٨ ألف جنيه.
//
// **بننبّه بس، مانصلّحش لوحدنا** — وده قرار مقصود:
//   • أحيانًا الرقم عندنا هو الغلط، فالتصليح الأوتوماتيك يبعت الغلط لبوسطة.
//   • وأحيانًا الاتنين صح: أوردر ١٢٤٨ عندنا ٤٠٨٩ وبوسطة ٧٩٠ لأنها شحنة
//     جزئية — والتصليح هيخرّب رقم بوسطة الصح.
//   • وبوسطة بتحدّد عدد مرات تعديل التحصيل، فالأوتوماتيك يستهلكهم.
//
// فالتنبيه بيوصلك بالرقمين، وإنت تدوس الزرار لو التصليح فعلًا مطلوب.
// ==========================================================================

import { alertHead } from "../alert-messages";

/** فرق أقل من ده بنعتبره تقريب مش مشكلة */
const TOLERANCE = 1;

export type CodCheck = {
  /** الفرق (بوسطة − عندنا) */
  diff: number;
  alert: boolean;
  /** الشحنة لسه ينفع تتعدّل؟ ده اللي بيحدد نص التنبيه */
  fixable: boolean;
  skip?: "matches" | "finished" | "no_bosta_value" | "already_alerted";
};

/** الحالات اللي خلصت — الفرق فيها تاريخ مش مشكلة تتحرك */
const FINISHED = ["delivered", "returned", "returned_after_delivery", "cancelled"];

export function checkCod(input: {
  orderStatus: string | null | undefined;
  /** التحصيل المحسوب من بنود الأوردر */
  ours: number;
  /** اللي بوسطة شايلاه */
  bosta: number | null | undefined;
  /** بوسطة قايلة إن التعديل مقفول؟ */
  codUpdateBlocked: boolean | null | undefined;
  /** آخر فرق نبّهنا عليه — عشان منزنّش كل ١٥ دقيقة على نفس الفرق */
  alertedAmount: number | null | undefined;
}): CodCheck {
  const { orderStatus, ours, bosta, codUpdateBlocked, alertedAmount } = input;

  // ⚠️⚠️ **الصفر مش «مفيش قيمة» — الصفر معناه «متحصّلش حاجة».**
  //
  // الشرط ده كان `bosta <= 0`، فكان بيبلع **أخطر حالة ممكنة**: بوسطة
  // هتسلّم الشحنة وماتحصّلش ولا جنيه، وإحنا ساكتين.
  //
  // الفحص لقى **٢٧ أوردر اتسلّموا فعلًا** تحصيلهم عند بوسطة صفر ومحدش
  // دفع مقدم — بإجمالي **٦٣٬٦٩٧ ج**. ولا واحد فيهم طلّع تنبيه.
  //
  // دلوقتي: **مفيش قيمة** (`null`) بنسكت — دي شحنة لسه ماتعملتش أو مرتجع
  // بوسطة مابتقوليش تحصيله. **صفر صريح** بيعدّي للفحص عادي، وبيطلّع تنبيه
  // لو إحنا مستنيين فلوس.
  if (typeof bosta !== "number") {
    return { diff: 0, alert: false, fixable: false, skip: "no_bosta_value" };
  }

  const diff = Math.round((bosta - ours) * 100) / 100;

  if (Math.abs(diff) <= TOLERANCE) {
    return { diff, alert: false, fixable: false, skip: "matches" };
  }
  if (FINISHED.includes(String(orderStatus ?? ""))) {
    return { diff, alert: false, fixable: false, skip: "finished" };
  }

  const fixable = codUpdateBlocked !== true;

  // نفس الفرق نبّهنا عليه قبل كده؟ نسكت. اتغيّر؟ ننبّه من جديد
  if (
    typeof alertedAmount === "number" &&
    Math.abs(alertedAmount - diff) <= TOLERANCE
  ) {
    return { diff, alert: false, fixable, skip: "already_alerted" };
  }

  return { diff, alert: true, fixable };
}

/** رسالة الفرق — بترجّع الرقمين وتقول تعمل إيه */
export function codMismatchMessage(a: {
  orderNumber: string | number | null;
  customerName: string | null;
  ours: number;
  bosta: number;
  fixable: boolean;
}): string {
  // ⚠️ **الصفر ليه رسالة مختلفة** — «التحصيل مختلف» بتقلّل الحكاية.
  // بوسطة بصفر معناها الشحنة هتوصل والمندوب **مش هياخد ولا جنيه**.
  if (a.bosta === 0) {
    const lines = alertHead(
      "🚨",
      `أوردر ${a.orderNumber ?? "—"} بوسطة مش هتحصّل حاجة`,
      a.customerName
    );
    lines.push(`الشحنة عند بوسطة تحصيلها <b>صفر</b>، والأوردر <b>${a.ours}</b>`);
    lines.push(
      a.fixable
        ? "لسه ينفع يتعدّل"
        : "المندوب ماشي بيها — الفلوس دي مش هتتحصّل"
    );
    return lines.join("\n");
  }

  const lines = alertHead(
    "💰",
    `أوردر ${a.orderNumber ?? "—"} التحصيل مختلف`,
    a.customerName
  );
  lines.push(`عندنا <b>${a.ours}</b> · بوسطة <b>${a.bosta}</b>`);
  lines.push(
    a.fixable
      ? "افتح الأوردر: ابعت رقمنا لبوسطة، أو اعمله تجاهل"
      : "المندوب ماشي بمبلغ بوسطة — راجع الأوردر"
  );
  return lines.join("\n");
}

// ==========================================================================
// الأوردر اتعدّل عند شوبيفاي — نرجّعه زي ما هو هناك
// --------------------------------------------------------------------------
// الاستيراد **بيضيف الجديد ويزامن الإلغاء بس** — ده قرار قديم مكتوب في
// `order-import-plan.ts`. يعني لو حد زوّد صنف أو غيّر كمية عند شوبيفاي بعد
// ما الأوردر دخل، السيستم مايعرفش.
//
// حالة حقيقية عند ٢ سِك (١٢ سبتمبر ٢٠٢٦): أوردر **#1447 عندنا ٧٢٩ وعند
// شوبيفاي ١٢٢٨** — فرق ٤٩٩ جنيه من صنف اتزوّد عندهم.
//
// ⚠️⚠️ **ومابيتعملش لوحده بقصد.** التحديث التلقائي بيمسح تعديلات الموظفين
// من ورا ظهرهم: واحد يشيل بند من السيستم عن قصد، واللفة الجاية ترجّعه.
// اللي بيحصل: السيستم بيقول **إيه اللي مختلف**، والقرار بضغطة.
//
// ⚠️ **والأوردر اللي راح لبوسطة مايتلمسش.** الشحنة اتعملت بمبلغ تحصيل
// معيّن وبوسطة شايلاه — تغيير البنود عندنا بيخلّي رقمنا يختلف عن اللي
// المندوب هيحصّله فعلًا.
//
// **الملف ده صافي** — بياخد الاتنين وبيقول يتعمل إيه.
// ==========================================================================

/** فرق أقل من ده تقريب مش تعديل */
const TOLERANCE = 1;

/** حالات مقفولة — الأوردر خلص وتغييره بيبوّظ تاريخ */
const LOCKED = ["delivered", "returned", "returned_after_delivery", "cancelled"];

export type OurLine = {
  variantId: string | null;
  quantity: number;
  salePrice: number;
};

export type ShopLine = {
  /** رقم الشكل عند شوبيفاي */
  shopifyVariantId: string | null;
  /** الاسم — للعرض بس لما الشكل مش عندنا */
  title: string | null;
  /** ⚠️ الكمية **الحالية** بعد التعديل مش الأصلية */
  quantity: number;
  unitPrice: number;
};

export type ResyncInput = {
  orderStatus: string | null;
  /** رقم شحنة بوسطة — وجوده معناه الأوردر راح */
  bostaTracking: string | null;
  ourLines: OurLine[];
  ourDiscount: number;
  ourShipping: number;
  shopLines: ShopLine[];
  /** إجمالي شوبيفاي الحالي */
  shopTotal: number;
  /** الشكل عند شوبيفاي ← الشكل عندنا */
  variantMap: Record<string, string>;
};

export type ResyncPlan =
  | {
      ok: true;
      /** البنود الجديدة اللي هتتكتب */
      lines: { variantId: string; quantity: number; salePrice: number }[];
      /** إجمالينا قبل وبعد */
      before: number;
      after: number;
      diff: number;
    }
  | { ok: false; reason: string };

function total(lines: { quantity: number; salePrice: number }[], discount: number, shipping: number): number {
  return (
    lines.reduce((s, l) => s + Number(l.quantity) * Number(l.salePrice), 0) -
    Number(discount || 0) +
    Number(shipping || 0)
  );
}

/**
 * يتعمل إيه.
 *
 * ⚠️ **بيرجّع السبب بالعربي لما ماينفعش** — الزرار اللي بيختفي من غير سبب
 * بيخلّي اللي بيستخدمه يفتكر إن السيستم باظ.
 */
export function planResync(input: ResyncInput): ResyncPlan {
  const status = String(input.orderStatus ?? "");

  if (LOCKED.includes(status)) {
    return { ok: false, reason: "الأوردر ده خلص — تغييره بيبوّظ التاريخ" };
  }

  // ⚠️ **الشحنة اتعملت خلاص** — بوسطة شايلة مبلغ تحصيل، وتغيير البنود
  // بيخلّي رقمنا يختلف عن اللي المندوب هيحصّله
  if (String(input.bostaTracking ?? "").trim()) {
    return { ok: false, reason: "الأوردر راح لبوسطة — التحصيل متسجّل عندهم" };
  }

  const shop = input.shopLines.filter((l) => Number(l.quantity) > 0);
  if (shop.length === 0) {
    return { ok: false, reason: "شوبيفاي مارجّعتش بنود للأوردر ده" };
  }

  // ⚠️⚠️ **الشكل اللي مش عندنا بيوقف كل حاجة** — بند من غير منتج معناه
  // إجمالي غلط، وده أوحش من إن التعديل مايتزامنش. نفس قاعدة الاستيراد.
  const lines: { variantId: string; quantity: number; salePrice: number }[] = [];
  const missing: string[] = [];

  for (const l of shop) {
    const key = String(l.shopifyVariantId ?? "").trim();
    const mine = key ? input.variantMap[key] : undefined;
    if (!mine) {
      missing.push(l.title || "بند من غير اسم");
      continue;
    }
    lines.push({
      variantId: mine,
      quantity: Math.max(1, Math.floor(Number(l.quantity))),
      salePrice: Math.max(0, Number(l.unitPrice) || 0),
    });
  }

  if (missing.length > 0) {
    return {
      ok: false,
      reason: `فيه منتج مش عندنا: ${missing.slice(0, 3).join(" · ")} — هات المنتجات من شوبيفاي الأول`,
    };
  }

  const before = total(input.ourLines, input.ourDiscount, input.ourShipping);
  const after = total(lines, input.ourDiscount, input.ourShipping);
  const diff = Math.round((after - before) * 100) / 100;

  // ⚠️ **مافيش فرق؟ مافيش شغل.** الكتابة من غير سبب بتعمل حركة مخزون
  // وسطر سجل على لا حاجة.
  if (Math.abs(diff) <= TOLERANCE) {
    return { ok: false, reason: "مفيش فرق — الأوردر مطابق لشوبيفاي" };
  }

  return { ok: true, lines, before, after, diff };
}

/** «زوّد ٤٩٩ جنيه» · «نقّص ٢٠٠ جنيه» */
export function resyncSummary(plan: ResyncPlan): string {
  if (!plan.ok) return plan.reason;
  const n = Math.abs(Math.round(plan.diff));
  return plan.diff > 0
    ? `هيزوّد ${n} جنيه — من ${Math.round(plan.before)} لـ${Math.round(plan.after)}`
    : `هينقّص ${n} جنيه — من ${Math.round(plan.before)} لـ${Math.round(plan.after)}`;
}

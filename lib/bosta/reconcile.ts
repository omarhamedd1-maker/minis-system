// ==========================================================================
// عقل المزامنة: بياخد شحنة من بوسطة وأوردر من عندنا، وبيقرر يتغيّر إيه.
// --------------------------------------------------------------------------
// الدالة دي **مابتلمسش قاعدة البيانات ولا الشبكة** — بتاخد أرقام وترجّع قرار.
// وده اللي بيخليها تتختبر، ودي كانت أكبر مشكلة في الدالة القديمة.
// ==========================================================================

import { shippingCost, type CarrierFeeRules } from "../shipping-cost";
import { canSyncChangeStatus, mapBostaDelivery } from "./order-status";
import { summarizeException, type BostaAttempt } from "./exception";

export type BostaDelivery = {
  trackingNumber?: string | null;
  /** `code` هو الحالة الدقيقة، و`value` مجمّعة وبتخلط المتسلّم بالراجع */
  state?: {
    value?: string | null;
    code?: number | null;
    delayReason?: string | null;
    /** تفاصيل المحاولات — السبب الحقيقي عايش هنا مش في الخانات التانية */
    exception?: BostaAttempt[] | null;
    waitingForBusinessAction?: boolean | null;
  } | null;
  /** النص جاي من جلب الشحنة لوحدها؟ ساعتها هو الأدق حاجة عندنا */
  stateIsDetailed?: boolean;
  /**
   * نوع الشحنة عند بوسطة — **لازم**، لأن نفس الكود معناه بيختلف بيه.
   * ١٠ = إرسال للعميل · ٢٠ = رجوع لك
   */
  type?: { code?: number | null; value?: string | null } | null;
  cod?: number | null;
  allowToOpenPackage?: boolean | null;
  shopifyInfo?: { orderNumber?: string | null } | null;
  businessReference?: string | null;
  createdAt?: string | null;
  latestExceptionReason?: string | null;
  exceptionReason?: string | null;
};

/**
 * بيحوّل تاريخ بوسطة لصيغة بوستجرس بيفهمها.
 *
 * **ده مش تنظيف زايد.** بوسطة بترجّع التاريخ بشكل
 * `"Wed Jul 29 2026 16:11:28 GMT+0000 (Coordinated Universal Time)"` —
 * ودي صيغة `Date.toString()` مش ISO، وبوستجرس بيرفضها. النتيجة كانت إن
 * التاريخ مايتحفظش، والمزامنة تحاول تكتبه في ٢٢٢ أوردر كل ١٥ دقيقة وتفشل.
 * (سجل `sync_runs` هو اللي كشفها.)
 *
 * وبنرجّع null لو التاريخ مش مفهوم — أحسن من إننا نكتب حاجة غلط.
 */
export function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/**
 * نفس اللحظة؟ — مقارنة تواريخ بالوقت مش بالنص.
 * لازم كده لأن بوستجرس بيرجّع `+00:00` وإحنا بنكتب `.000Z`، ومقارنة النص
 * بينهم بتفضل تفشل للأبد فبنكتب نفس القيمة كل مزامنة.
 */
export function sameInstant(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return !a && !b;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta === tb;
}

/** سبب وقوف الشحنة عند بوسطة (عنوان مش واضح، العميل مش بيرد…) */
export function deliveryException(d: BostaDelivery): string | null {
  // **تفاصيل المحاولات الأول.** الخانات التانية بترجع فاضية عند بوسطة،
  // فسبب وقوف أوردر ١٣٦٤ ("العميل رفض يستلم") مكانش بيوصلنا خالص.
  const summary = summarizeException(d.state);
  if (summary) return summary.text;

  return (
    d.latestExceptionReason ?? d.state?.delayReason ?? d.exceptionReason ?? null
  );
}

export type OurOrder = {
  id: string;
  order_number: string | number | null;
  order_status: string | null;
  delivered_at: string | null;
  bosta_tracking: string | null;
  bosta_state: string | null;
  bosta_cod: number | null;
  bosta_collected: boolean | null;
  bosta_shipping_cost: number | null;
  bosta_exception: string | null;
  bosta_created_at: string | null;
  /**
   * الأوردر عليه شحنة مرتجع من العميل؟
   * ساعتها **المرتجع هو اللي بيحدد الحالة** والشحنة الأصلية مالهاش كلمة —
   * وإلا الاتنين بيتخانقوا: المرتجع يقول "في الطريق ليك" والأصلية تقول
   * "تم التسليم"، وكل ١٥ دقيقة واحد يلغي التاني. حصل فعلًا في أوردر ١٢٢٧
   * وطلّع ٤٣ سطر سجل و٣٩ إشعار.
   */
  hasCustomerReturn: boolean;
  /** إجمالي بنود الأوردر — التأمين بيتحسب عليه */
  productValue: number;
};

export type SyncDecision = {
  /** التعديلات اللي هتتكتب — لو فاضية يبقى مفيش حاجة اتغيرت */
  changes: Record<string, unknown>;
  /** ليه اتغيرت، بالعربي، عشان نعرضها في المراجعة */
  reasons: string[];
  /** الحالة اتقفلت عشان إحنا حددناها بإيدنا */
  statusLocked: boolean;
};

/** رقم الأوردر اللي بوسطة شايلاه في الشحنة */
export function deliveryOrderNumber(d: BostaDelivery): string {
  const raw =
    d?.shopifyInfo?.orderNumber ??
    String(d?.businessReference ?? "").split(":").pop() ??
    "";
  return String(raw).replace("#", "").trim();
}

export function decideSync(
  d: BostaDelivery,
  o: OurOrder,
  now: Date,
  rules?: CarrierFeeRules,
  /**
   * لو الأوردر ليه أكتر من شحنة، بنبعت هنا مجموع التحصيل ومجموع الرسوم.
   * `d` ساعتها بتبقى أحدث شحنة (منها الحالة ورقم التتبع).
   */
  totals?: { cod: number; fee: number }
): SyncDecision {
  const changes: Record<string, unknown> = {};
  const reasons: string[] = [];

  const tracking = d.trackingNumber ? String(d.trackingNumber) : "";
  const state = d.state?.value ?? null;
  const cod = totals ? totals.cod : Number(d.cod ?? 0);
  // بالكود مش بالنص المجمّع — النص بيلبّس الشحنة الراجعة على المتسلّمة.
  // ولو جبنا الحالة التفصيلية من بوسطة، هي الأدق فبتكسب.
  const mapped = mapBostaDelivery(d.state, d.stateIsDetailed, d.type?.code);

  if (tracking && o.bosta_tracking !== tracking) {
    changes.bosta_tracking = tracking;
    reasons.push(`ربط رقم التتبع ${tracking}`);
  }

  if (state && o.bosta_state !== state) {
    changes.bosta_state = state;
    reasons.push(`حالة بوسطة بقت ${state}`);
  }

  if (cod !== Number(o.bosta_cod ?? 0)) {
    changes.bosta_cod = cod;
    reasons.push(`مبلغ التحصيل بقى ${cod}`);
  }

  // تاريخ إنشاء الشحنة عند بوسطة — منه بنعرف إنها واقفة من كام يوم.
  // بنكتبه مرة واحدة وبس؛ لو الأوردر عليه شحنة جديدة، رقم التتبع بيتغيّر
  // فوق فبنجدّده معاه.
  // ⚠️ المقارنة **بالوقت مش بالنص**. بوستجرس بيرجّع
  // `2026-04-19T09:58:00+00:00` وإحنا بنكتب `2026-04-19T09:58:00.000Z` —
  // نفس اللحظة بالظبط بس نصّين مختلفين، فمقارنة النص بتفشل دايمًا وبنكتب
  // التاريخ من جديد كل ١٥ دقيقة في ٢١٦ أوردر على الفاضي.
  const created = isoDate(d.createdAt);
  if (created && !sameInstant(o.bosta_created_at, created)) {
    changes.bosta_created_at = created;
    // شحنة جديدة = صفحة جديدة، فالتنبيه القديم يتشال
    if (changes.bosta_tracking) changes.bosta_stale_alerted_day = null;
  }

  const exception = deliveryException(d);
  if ((o.bosta_exception ?? null) !== exception) {
    changes.bosta_exception = exception;
    if (exception) reasons.push(`بوسطة واقفة: ${exception}`);
  }

  // "مرتجع بعد التسليم" اتسلّم فعلاً، فرسومه كاملة زي المتسلّم —
  // رسوم المرتجع المخففة بتبقى للي رجع من غير ما يتسلّم أصلاً
  const feesAsReturned =
    mapped === "returned" && o.order_status !== "returned_after_delivery";

  const fee = totals
    ? totals.fee
    : shippingCost(
        {
          cod,
          productValue: o.productValue,
          allowToOpenPackage: Boolean(d.allowToOpenPackage),
          returned: feesAsReturned,
        },
        rules
      ).total;

  if (Math.abs(fee - Number(o.bosta_shipping_cost ?? 0)) > 0.009) {
    changes.bosta_shipping_cost = fee;
    reasons.push(`رسوم بوسطة بقت ${fee.toFixed(2)}`);
  }

  const collected = mapped === "delivered";
  if (collected !== Boolean(o.bosta_collected)) {
    changes.bosta_collected = collected;
    reasons.push(collected ? "اتحصّلت" : "اتشالت من المحصّل");
  }

  // الحالات اللي إحنا حددناها بإيدنا المزامنة مامتغيرهاش.
  // وكمان: الأوردر اللي عليه شحنة مرتجع، الشحنة الأصلية مامتغيرش حالته.
  let statusLocked = false;
  if (mapped && mapped !== o.order_status) {
    if (o.hasCustomerReturn) {
      statusLocked = true;
    } else if (canSyncChangeStatus(o.order_status)) {
      changes.order_status = mapped;
      reasons.push(`حالة الأوردر بقت ${mapped}`);
      // أول ما يبقى متسلّم ومفيش تاريخ، بنسجّل التاريخ
      if (mapped === "delivered" && !o.delivered_at) {
        changes.delivered_at = now.toISOString();
      }
    } else {
      statusLocked = true;
    }
  }

  return { changes, reasons, statusLocked };
}

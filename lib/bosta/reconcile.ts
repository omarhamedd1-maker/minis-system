// ==========================================================================
// عقل المزامنة: بياخد شحنة من بوسطة وأوردر من عندنا، وبيقرر يتغيّر إيه.
// --------------------------------------------------------------------------
// الدالة دي **مابتلمسش قاعدة البيانات ولا الشبكة** — بتاخد أرقام وترجّع قرار.
// وده اللي بيخليها تتختبر، ودي كانت أكبر مشكلة في الدالة القديمة.
// ==========================================================================

import { shippingCost, type CarrierFeeRules } from "../shipping-cost";
import { canSyncChangeStatus, mapBostaDelivery } from "./order-status";

export type BostaDelivery = {
  trackingNumber?: string | null;
  /** `code` هو الحالة الدقيقة، و`value` مجمّعة وبتخلط المتسلّم بالراجع */
  state?: {
    value?: string | null;
    code?: number | null;
    delayReason?: string | null;
  } | null;
  /** النص جاي من جلب الشحنة لوحدها؟ ساعتها هو الأدق حاجة عندنا */
  stateIsDetailed?: boolean;
  cod?: number | null;
  allowToOpenPackage?: boolean | null;
  shopifyInfo?: { orderNumber?: string | null } | null;
  businessReference?: string | null;
  createdAt?: string | null;
  latestExceptionReason?: string | null;
  exceptionReason?: string | null;
};

/** سبب وقوف الشحنة عند بوسطة (عنوان مش واضح، العميل مش بيرد…) */
export function deliveryException(d: BostaDelivery): string | null {
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
  const mapped = mapBostaDelivery(d.state, d.stateIsDetailed);

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
  if (d.createdAt && o.bosta_created_at !== d.createdAt) {
    changes.bosta_created_at = d.createdAt;
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

  // الحالات اللي إحنا حددناها بإيدنا المزامنة مامتغيرهاش
  let statusLocked = false;
  if (mapped && mapped !== o.order_status) {
    if (canSyncChangeStatus(o.order_status)) {
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

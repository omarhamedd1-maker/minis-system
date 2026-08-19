// ==========================================================================
// كلام صفحة التتبع — إنجليزي، ودّي، وبتفاصيل
// --------------------------------------------------------------------------
// دي الصفحة الوحيدة في السيستم اللي **العميل** بيقراها مش صاحب المتجر —
// وباقي السيستم عربي مصري لأنه بيتكلّم مع صاحب المتجر. الصفحة دي إنجليزي
// بقرار عمر: نبرة لطيفة وبسيطة تليق على متجر.
//
// ⚠️ **كل حالة ليها ٣ حاجات**: عنوان قصير، جملة بتقول اللي بيحصل دلوقتي،
// وجملة بتقول **اللي بعده** — العميل بيسأل «طيب وبعدين؟» أكتر ما بيسأل
// «هي فين؟».
//
// ⚠️ **ومفيش أي جملة بتلوم العميل ولا بتخوّفه.** «رفض الاستلام» و«مش بيرد»
// أسباب داخلية — على الصفحة بتبقى «we couldn't complete the delivery».
//
// **الملف ده صافي** — نصوص وبس.
// ==========================================================================

export type StatusCopy = {
  /** العنوان الكبير */
  title: string;
  /** اللي بيحصل دلوقتي */
  now: string;
  /** اللي بعده — و`null` لو الرحلة خلصت */
  next: string | null;
  /** لون الحالة على الصفحة */
  tone: "good" | "moving" | "warn" | "done";
};

export const STATUS_COPY: Record<string, StatusCopy> = {
  new: {
    title: "We got your order",
    now: "It's in and we're getting it ready.",
    next: "We'll call to confirm the details before it ships.",
    tone: "moving",
  },
  confirmed: {
    title: "Your order is confirmed",
    now: "Thanks for confirming — we're packing it now.",
    next: "Next it goes to our courier for pickup.",
    tone: "moving",
  },
  packed: {
    title: "Packed and ready",
    now: "Everything's boxed and labelled.",
    next: "The courier picks it up on the next run.",
    tone: "moving",
  },
  ready: {
    title: "Handed to the courier",
    now: "It's waiting for the driver at the pickup point.",
    next: "Once a driver takes it, you'll see it move.",
    tone: "moving",
  },
  shipped: {
    title: "On its way",
    now: "The courier has your parcel and it's travelling to your city.",
    next: "It usually reaches you within a day or two.",
    tone: "moving",
  },
  out_for_delivery: {
    title: "Out for delivery",
    now: "A driver is heading to your address right now.",
    next: "Keep your phone nearby — they'll call when they're close.",
    tone: "good",
  },
  delivered: {
    title: "Delivered",
    now: "Your parcel was handed over. We hope you love it.",
    next: null,
    tone: "done",
  },
  awaiting_action: {
    title: "We need a hand",
    now: "We couldn't complete the delivery, so the parcel is on hold.",
    next: "Message us with a good time or a clearer address and we'll try again.",
    tone: "warn",
  },
  returning: {
    title: "Heading back to us",
    now: "The parcel is on its way back after the delivery attempts.",
    next: "If you still want it, message us and we'll send it out again.",
    tone: "warn",
  },
  returned: {
    title: "Back with us",
    now: "The parcel made it back to our warehouse.",
    next: "Want it again? Message us and we'll arrange a new delivery.",
    tone: "warn",
  },
  returned_after_delivery: {
    title: "Return received",
    now: "Your return arrived and we've checked it in.",
    next: "If a refund is due, it's on its way to you.",
    tone: "done",
  },
  cancelled: {
    title: "Order cancelled",
    now: "This order was cancelled and nothing is on the way.",
    next: "If that wasn't intentional, message us and we'll sort it out.",
    tone: "done",
  },
};

/**
 * ⚠️ **الحالة المجهولة بتدّي كلام محايد** — «unknown status» على صفحة
 * بيقراها عميل بتخوّف من غير سبب.
 */
export const FALLBACK_COPY: StatusCopy = {
  title: "Your order is on the move",
  now: "We're tracking it and this page updates as it goes.",
  next: "Check back in a bit for the next step.",
  tone: "moving",
};

/** أسماء الخطوات على الخط */
export const STEP_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  ready: "With the courier",
  shipped: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

export const UI = {
  trackingLabel: "Tracking",
  detailsPrompt: "Want the full details? Enter the last 2 digits of the phone number on this order.",
  detailsPlaceholder: "67",
  detailsButton: "Show",
  wrong: "That doesn't match this order.",
  locked: "Too many tries. Please wait a little and try again.",
  notFound: "We couldn't find a parcel with this number",
  notFoundHint: "Double-check the number, and if it's still missing just message the store.",
  orderNumber: "Order",
  placed: "Placed",
  deliveredOn: "Delivered",
  toPay: "To pay on delivery",
  paid: "paid",
  address: "Delivering to",
  items: "What's inside",
} as const;

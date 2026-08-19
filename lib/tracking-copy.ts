// ==========================================================================
// كلام صفحة التتبع — إنجليزي، ودّي، وبتفاصيل
// --------------------------------------------------------------------------
// دي الصفحة الوحيدة في السيستم اللي **العميل** بيقراها مش صاحب المتجر —
// وباقي السيستم عربي مصري لأنه بيتكلّم مع صاحب المتجر. الصفحة دي إنجليزي
// بقرار عمر: نبرة لطيفة وبسيطة تليق على متجر.
//
// ⚠️ **كل حالة ليها حاجتين**: عنوان قصير وجملة بتقول اللي بيحصل دلوقتي.
//
// **وسطر «اللي بعده» اتشال بقرار عمر** — الصفحة بقت أقصر وأنضف.
//
// ⚠️ **و«متجهّز» و«محتاج تصرّف» اتشالوا من القايمة بقرار عمر** — واللي مش
// في القايمة بياخد الكلام المحايد (`FALLBACK_COPY`) بدل ما يقع.
//
// ⚠️ **وكلمة «parcel» اتشالت** — دي كلمة شركة شحن. العميل بيقول «order».
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
  /** لون الحالة على الصفحة */
  tone: "good" | "moving" | "warn" | "done";
};

export const STATUS_COPY: Record<string, StatusCopy> = {
  new: {
    title: "We got your order",
    now: "It's in and we're getting it ready.",
    tone: "moving",
  },
  confirmed: {
    title: "Your order is confirmed",
    now: "Thanks for confirming — we're packing it now.",
    tone: "moving",
  },
  ready: {
    title: "Ready to ship",
    now: "It's packed, labelled, and waiting for the courier to collect it.",
    tone: "moving",
  },
  shipped: {
    title: "On its way",
    now: "It's with the courier and on the way to your city.",
    tone: "moving",
  },
  out_for_delivery: {
    title: "Out for delivery",
    now: "A driver is heading to your address right now.",
    tone: "good",
  },
  delivered: {
    title: "Delivered",
    now: "Your order arrived. We hope you love it.",
    tone: "done",
  },
  returning: {
    title: "Heading back to us",
    now: "Your order is on its way back to us.",
    tone: "warn",
  },
  returned: {
    title: "Back with us",
    now: "Your order is back with us.",
    tone: "warn",
  },
  returned_after_delivery: {
    title: "Return received",
    now: "Your return arrived and we've checked it in.",
    tone: "done",
  },
  cancelled: {
    title: "Order cancelled",
    now: "This order was cancelled and nothing is on the way.",
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
  tone: "moving",
};

/** أسماء الخطوات على الخط */
export const STEP_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  ready: "Ready to ship",
  shipped: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

export const UI = {
  trackingLabel: "Tracking",
  detailsPrompt: "Want the full details? Enter the phone number on this order.",
  detailsHint: "It ends with",
  detailsPlaceholder: "01xxxxxxxxx",
  detailsButton: "Show",
  wrong: "That doesn't match this order.",
  locked: "Too many tries. Please wait a little and try again.",
  notFound: "We couldn't find an order with this number",
  notFoundHint: "Double-check the number, and if it's still missing just message the store.",
  orderNumber: "Order",
  placed: "Placed",
  deliveredOn: "Delivered",
  toPay: "To pay on delivery",
  paid: "paid",
  address: "Delivering to",
  items: "What's inside",
} as const;

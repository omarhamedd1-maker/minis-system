// ==========================================================================
// الأوردرات اللي راحت لبوسطة وضاع رقم تتبعها
// --------------------------------------------------------------------------
// فيه أوردرات حالتها بتقول إنها عدّت على بوسطة (اتشحنت، اتسلّمت، رجعت) بس
// مالهاش رقم تتبع عندنا. النتيجة إن **رسوم شحنها مش داخلة الحسبة** — فالربح
// بيبان أكبر من الحقيقة، والتحصيل مابيتطابقش.
//
// ده بيحصل لما الشحنة تتعمل من لوحة بوسطة بإيد حد بدل ما تتبعت من السيستم.
//
// بندوّر على شحنة بوسطة بنفس رقم الأوردر، **والاسم لازم يأكد**. الحماية دي
// مش رفاهية: رقم مرجع غلط ممكن يلزق شحنة عميل على أوردر عميل تاني، وده
// بيحرّك فلوس. لو الاسمين مالهمش أي كلمة مشتركة بنسيبها لعمر يقرر.
//
// وكمان لو نفس رقم الأوردر عليه أكتر من شحنة مش مربوطة، بنوقف — مش هنخمّن
// أنهي واحدة الصح.
//
// **الملف ده بيقرر بس.** الكتابة في مكان تاني، وبيتعرض قبل ما يتنفّذ.
// ==========================================================================

import { deliveryOrderNumber, type BostaDelivery } from "./reconcile";
import { namesShare } from "./match";

export type UnlinkedOrder = {
  id: string;
  orderNumber: string | number | null;
  customerName: string | null;
  status: string | null;
};

export type LinkPlan = {
  /** اتطابقوا بالرقم والاسم — دول اللي هيتربطوا */
  links: {
    orderId: string;
    orderNumber: string;
    tracking: string;
    receiverName: string;
    state: string;
  }[];
  /** الاسم مختلف تمامًا — محتاج عين بني آدم */
  nameMismatch: {
    orderNumber: string;
    tracking: string;
    ourName: string;
    bostaName: string;
  }[];
  /** أكتر من شحنة على نفس رقم الأوردر — مش هنخمّن */
  ambiguous: { orderNumber: string; trackings: string[] }[];
  /** مالقيناش لهم شحنة خالص */
  notFound: { orderId: string; orderNumber: string }[];
};

type Delivery = BostaDelivery & {
  receiver?: { fullName?: string | null } | null;
};

export function planShipmentLinks(
  orders: UnlinkedOrder[],
  deliveries: Delivery[],
  /** أرقام التتبع المربوطة بأوردرات تانية — منلزقهاش مرتين */
  takenTrackings: Set<string> = new Set()
): LinkPlan {
  const plan: LinkPlan = {
    links: [],
    nameMismatch: [],
    ambiguous: [],
    notFound: [],
  };

  // نجمّع شحنات بوسطة حسب رقم الأوردر اللي عليها
  const byOrderNumber = new Map<string, Delivery[]>();
  for (const d of deliveries) {
    const num = deliveryOrderNumber(d);
    const tracking = d.trackingNumber ? String(d.trackingNumber) : "";
    if (!num || !tracking || takenTrackings.has(tracking)) continue;
    const list = byOrderNumber.get(num);
    if (list) list.push(d);
    else byOrderNumber.set(num, [d]);
  }

  for (const order of orders) {
    const num = String(order.orderNumber ?? "").trim();
    const found = num ? (byOrderNumber.get(num) ?? []) : [];

    if (found.length === 0) {
      plan.notFound.push({ orderId: order.id, orderNumber: num });
      continue;
    }

    if (found.length > 1) {
      plan.ambiguous.push({
        orderNumber: num,
        trackings: found.map((d) => String(d.trackingNumber)),
      });
      continue;
    }

    const d = found[0];
    const bostaName = d.receiver?.fullName ?? "";
    if (!namesShare(order.customerName ?? "", bostaName)) {
      plan.nameMismatch.push({
        orderNumber: num,
        tracking: String(d.trackingNumber),
        ourName: order.customerName ?? "",
        bostaName: String(bostaName),
      });
      continue;
    }

    plan.links.push({
      orderId: order.id,
      orderNumber: num,
      tracking: String(d.trackingNumber),
      receiverName: String(bostaName),
      state: String(d.state?.value ?? ""),
    });
  }

  return plan;
}

// ==========================================================================
// مقارنة: إيه اللي في بوسطة ومش عندنا، وإيه اللي عندنا ومش في بوسطة
// --------------------------------------------------------------------------
// عمر طلب «طريقة أفحص كل حبة أشوف الأوردرات اللي في بوسطة في السيستم ولا
// لأ». والسؤال ده ليه إجابتين مختلفتين تمامًا:
//
//   • **شحنة عند بوسطة ومالهاش أوردر عندنا** — دي فلوس ماشية من غير سجل.
//     يا إما اتبعتت بإيد من لوحة بوسطة ومحدش ربطها، يا إما أوردر اتمسح.
//
//   • **أوردر عندنا المفروض يبقى مشحون ومفيش شحنة** — دي شحنة ماتعملتش
//     أصلًا، والعميل مستني.
//
// دوال صافية بالكامل — الجلب والعرض برّه.
// ==========================================================================

/** الشحنة زي ما بوسطة بترجّعها، بالحقول اللي تهمنا بس */
export type CoverageShipment = {
  trackingNumber: string | null;
  /** رقم الأوردر اللي بعتناه لبوسطة وقت الإنشاء */
  businessReference?: string | null;
  state?: string | null;
  cod?: number | null;
  createdAt?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
};

export type CoverageOrder = {
  id: string;
  orderNumber: string | null;
  status: string | null;
  tracking: string | null;
  customerPhone?: string | null;
};

export type CoverageResult = {
  /** في بوسطة ومالهاش أوردر عندنا */
  onlyInBosta: CoverageShipment[];
  /** عندنا ومفيش شحنة — المفروض تتبعت */
  onlyInSystem: CoverageOrder[];
  /** متطابقة — عدد بس */
  matched: number;
};

/** آخر ١٠ أرقام — بوسطة بتكتب الرقم عالمي وإحنا محلي */
export function lastTen(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}

/**
 * الحالات اللي المفروض يكون ليها شحنة عند بوسطة.
 *
 * **الملغي مش منهم بقصد** — الأوردر اللي اتلغى قبل ما يتشحن عمره ما هيبقى
 * له شحنة، وطلوعه في القايمة كل مرة بيخلّي القايمة تتقفل من غير ما تتقرا.
 */
export const SHOULD_HAVE_SHIPMENT = [
  "packed",
  "ready",
  "shipped",
  "out_for_delivery",
  "delivered",
  "awaiting_action",
  "returning",
  "returned",
  "returned_after_delivery",
];

/**
 * بيقارن القايمتين.
 *
 * **المطابقة بتلاقي الشحنة بتلات طرق بالترتيب**: رقم التتبع، وبعدين رقم
 * الأوردر اللي بوسطة محتفظة بيه (`businessReference`)، وبعدين تليفون
 * العميل. الطرق التلاتة موجودة لأن كل واحدة بتفشل في حالة: الشحنة اللي
 * اتعملت بإيد مالهاش `businessReference`، والأوردر اللي اتربط يدوي ممكن
 * يكون رقمه اتغيّر، والتليفون بيتكرر بين أوردرات نفس العميل.
 */
export function compareCoverage(
  shipments: CoverageShipment[],
  orders: CoverageOrder[]
): CoverageResult {
  const byTracking = new Map<string, CoverageOrder>();
  const byNumber = new Map<string, CoverageOrder>();
  const byPhone = new Map<string, CoverageOrder[]>();

  for (const o of orders) {
    if (o.tracking) byTracking.set(String(o.tracking).trim(), o);
    if (o.orderNumber) byNumber.set(String(o.orderNumber).trim(), o);
    const p = lastTen(o.customerPhone);
    if (p.length === 10) {
      byPhone.set(p, [...(byPhone.get(p) ?? []), o]);
    }
  }

  const usedOrders = new Set<string>();
  const onlyInBosta: CoverageShipment[] = [];
  let matched = 0;

  for (const s of shipments) {
    const tracking = String(s.trackingNumber ?? "").trim();
    const ref = String(s.businessReference ?? "").trim();

    let hit = (tracking && byTracking.get(tracking)) || null;
    if (!hit && ref) hit = byNumber.get(ref) ?? null;

    // **التليفون آخر حاجة، وبشرط واحد بس**: لو العميل عنده أوردرين
    // مانعرفش أنهي واحد، والتخمين هنا معناه إننا نقول «متطابقة» على
    // أوردر غلط
    if (!hit) {
      const candidates = byPhone.get(lastTen(s.receiverPhone)) ?? [];
      const free = candidates.filter((o) => !o.tracking && !usedOrders.has(o.id));
      if (free.length === 1) hit = free[0];
    }

    if (hit) {
      matched++;
      usedOrders.add(hit.id);
    } else {
      onlyInBosta.push(s);
    }
  }

  const onlyInSystem = orders.filter(
    (o) =>
      !o.tracking &&
      !usedOrders.has(o.id) &&
      SHOULD_HAVE_SHIPMENT.includes(o.status ?? "")
  );

  return { onlyInBosta, onlyInSystem, matched };
}

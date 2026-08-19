// ==========================================================================
// جلب الأوردرات والعملاء من شوبيفاي — القرار
// --------------------------------------------------------------------------
// العميل الجديد لما يربط متجره، تاريخه كله لسه عند شوبيفاي. من غير ما ننزّله
// السيستم بيبان فاضي، والأرباح والعملاء وكل حاجة بتبدأ من الصفر.
//
// **تلات قواعد بتحكم الجلب:**
//
//   ١. **الأوردر الموجود عندنا مابيتلمسش.** بنقارن برقم الأوردر عند شوبيفاي،
//      واللي موجود بيتعدّى. من غير ده أي جلب تاني بيعمل نُسخ.
//
//   ٢. **الأوردر اللي منتجاته مش عندنا مابيتجلبش.** بنوقفه ونقول للعميل
//      يجيب المنتجات الأول — لأن بند من غير منتج معناه أوردر بإجمالي غلط،
//      وده أسوأ من إن الأوردر ماييجيش أصلًا.
//
//   ٣. **حالة الأوردر بتتاخد من شوبيفاي بحذر.** الملغي ملغي، والمشحون
//      بنعتبره اتسلّم، وأي حاجة تانية بتيجي "جديد" والمزامنة أو الموظف
//      يظبّطها. الحالة بتحرّك الأرباح، فمابنخمّنش فيها.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات ولا أي استيراد.
// ==========================================================================

export type ShopifyLineIn = {
  shopifyVariantId: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
};

export type ShopifyOrderIn = {
  shopifyOrderId: string;
  /** رقم الأوردر اللي العميل بيعرفه (#1377 بيبقى "1377") */
  orderNumber: string;
  createdAt: string | null;
  cancelled: boolean;
  /**
   * تاريخ الإلغاء عند شوبيفاي.
   *
   * ⚠️ **مش تفصيلة**: لو كتبنا تاريخ النهاردة، إلغاء حصل في يونيو بيتحسب
   * في أغسطس — وتقارير الشهرين يكدبوا.
   */
  cancelledAt?: string | null;
  fulfilled: boolean;
  discount: number;
  /**
   * كود الخصم اللي العميل استخدمه.
   *
   * ⚠️ **الأوردرات اللي دخلت قبل ما الخانة دي تتعمل هتفضل فاضية** —
   * الاستيراد بيضيف الجديد بس، والكود مش متخزّن عندنا في أي مكان تاني.
   */
  discountCode?: string | null;
  shipping: number;
  customer: {
    shopifyCustomerId: string | null;
    fullName: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  lines: ShopifyLineIn[];
};

export type OurOrderKey = {
  shopifyOrderId: string | null;
  /** رقم الأوردر عندنا — لازم نقارن بيه كمان، اقرا `haveOrder` تحت */
  orderNumber: string | number | null;
  /** لازمين لمزامنة الإلغاء — اقرا `toCancel` تحت */
  id?: string;
  orderStatus?: string | null;
  bostaTracking?: string | null;
};
export type OurCustomerKey = {
  id: string;
  shopifyCustomerId: string | null;
  phone: string | null;
};

/** الحالة اللي هنكتبها عندنا */
export type ImportedStatus = "cancelled" | "delivered" | "new";

export function statusFromShopify(o: ShopifyOrderIn): ImportedStatus {
  if (o.cancelled) return "cancelled";
  // المشحون عند شوبيفاي = خرج من عندنا. أقرب حاجة عندنا هي "تم التسليم"،
  // والمزامنة هتصلّحها لو الشحنة لسه في الطريق.
  if (o.fulfilled) return "delivered";
  return "new";
}

export type OrderImportPlan = {
  /** هيتضافوا */
  toImport: {
    order: ShopifyOrderIn;
    status: ImportedStatus;
    /** العميل ده موجود عندنا ولا هيتعمل جديد */
    customerId: string | null;
    total: number;
  }[];
  /** موجود عندنا خلاص */
  alreadyHere: number;
  /**
   * ⚠️ **أوردرات اتلغت عند شوبيفاي بعد ما دخلت عندنا.**
   *
   * الاستيراد كان **بيضيف بس**: الأوردر اللي دخل مرة مايتلمسش تاني. يعني
   * العميل يلغي أوردره عند شوبيفاي وإحنا نفضل حاسبينه إيراد للأبد.
   *
   * ودي مش نظرية — **اتلقى ٦ أوردرات في مينيز بإجمالي ١١٬٩١٥ ج** مكتوب
   * عندهم «اتسلّم» وهم ملغيين من العميل عند شوبيفاي، **ومحصلش ليهم شحن
   * أصلًا** (مفيش رقم تتبع). اتفحص ١٨ أغسطس ٢٠٢٦.
   */
  toCancel: {
    id: string;
    orderNumber: string;
    was: string;
    /** تاريخ الإلغاء عند شوبيفاي — بيتكتب زي ما هو */
    at: string | null;
  }[];
  /**
   * الملغي عند شوبيفاي **بس عندنا ليه شحنة بوسطة** — مابنلمسهوش.
   *
   * الشحنة حقيقية وعليها تحصيل ورسوم عند بوسطة. تحويلها لـ«ملغي» من ورا
   * الشاشة بيبوّظ حساب بوسطة. القرار ده لواحد يشوفه بعينه.
   */
  cancelledButShipped: { orderNumber: string; was: string; tracking: string }[];
  /** فيه بند منتجه مش عندنا — لازم يجيب المنتجات الأول */
  missingProducts: {
    orderNumber: string;
    missing: string[];
  }[];
  /** من غير بنود خالص */
  noLines: string[];
  /** عملاء جداد هيتعملوا */
  newCustomers: number;
};

/** تليفون بالأرقام بس */
export function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/**
 * مفتاح مقارنة التليفون: **آخر ١٠ أرقام**.
 *
 * شوبيفاي بتدي الرقم بمفتاح الدولة (`+201005361491`) وإحنا مخزنينه محلي
 * (`01005361491`). المقارنة بالنص الكامل بتفشل، والنتيجة إن كل أوردر بيعمل
 * عميل جديد ويطلع عندك نفس الشخص عشر مرات.
 *
 * آخر ١٠ أرقام بتتجاهل المفتاح والصفر البادئ وتخلّي الاتنين يتطابقوا.
 */
export function phoneKey(phone: string | null | undefined): string {
  const d = digitsOnly(phone);
  return d.length >= 10 ? d.slice(-10) : "";
}

/**
 * مفتاح العميل جوّه الدفعة الواحدة — عشان عميل ليه أوردرين مايتعملش مرتين.
 *
 * **لازم `||` مش `??`.** `??` بيعدّي على `null` بس، والنص الفاضي بيعدّي منه —
 * فالأوردر اللي مالوش تليفون كان بياخد مفتاح فاضي، وكل الأوردرات اللي من غير
 * تليفون كانت هتتجمّع في عميل واحد. يعني ناس مالهاش علاقة ببعض تبقى شخص واحد.
 *
 * ولو مافيش تليفون خالص، كل أوردر بياخد عميله لوحده — أحسن من دمج غلط.
 */
export function customerKey(o: ShopifyOrderIn): string {
  return (
    o.customer?.shopifyCustomerId ||
    phoneKey(o.customer?.phone) ||
    `order:${o.orderNumber}`
  );
}

export function planOrderImport(
  shopifyOrders: ShopifyOrderIn[],
  ourOrders: OurOrderKey[],
  ourCustomers: OurCustomerKey[],
  /** أرقام الأشكال عند شوبيفاي اللي عندنا منها منتج */
  knownVariantIds: Set<string>
): OrderImportPlan {
  const plan: OrderImportPlan = {
    toImport: [],
    alreadyHere: 0,
    toCancel: [],
    cancelledButShipped: [],
    missingProducts: [],
    noLines: [],
    newCustomers: 0,
  };

  // **بنقارن بالرقمين مش برقم واحد.**
  //
  // الأوردر اللي اتستورد قبل كده رقمه عندنا `import-1072` مش رقم شوبيفاي
  // الحقيقي. لو قارنّا برقم شوبيفاي بس، الأوردر ده هيبان "مش موجود" ونجيبه
  // تاني — ويبقى عندك أوردرين رقمهم ١٠٧٢، وإيراد مضاعف.
  const haveOrder = new Set<string>();
  /** الصف نفسه — عشان الإلغاء يعرف يوصل له */
  const ourByKey = new Map<string, OurOrderKey>();
  for (const o of ourOrders) {
    const sid = String(o.shopifyOrderId ?? "");
    if (sid && !sid.startsWith("manual-") && !sid.startsWith("import-")) {
      haveOrder.add(sid);
      ourByKey.set(sid, o);
    }
    const num = String(o.orderNumber ?? "").trim();
    if (num) {
      haveOrder.add(`num:${num}`);
      if (!ourByKey.has(`num:${num}`)) ourByKey.set(`num:${num}`, o);
    }
  }

  /**
   * حالات إحنا اللي حطيناها بإيدنا — الاستيراد مايتخطاهاش.
   *
   * `returned_after_delivery` بالذات: الأوردر اتسلّم فعلًا وبعدين رجع،
   * وده قرار موظف مالوش علاقة بإلغاء شوبيفاي.
   */
  const LOCKED = new Set(["cancelled", "returned_after_delivery"]);

  const customerByShopifyId = new Map<string, string>();
  const customerByPhone = new Map<string, string>();
  for (const c of ourCustomers) {
    if (c.shopifyCustomerId) {
      customerByShopifyId.set(String(c.shopifyCustomerId), c.id);
    }
    const d = phoneKey(c.phone);
    if (d && !customerByPhone.has(d)) customerByPhone.set(d, c.id);
  }

  // عملاء جداد جوّه نفس الدفعة — عشان عميل ليه أوردرين مايتعملش مرتين
  const newCustomerKeys = new Set<string>();

  for (const o of shopifyOrders) {
    if (
      haveOrder.has(String(o.shopifyOrderId)) ||
      haveOrder.has(`num:${o.orderNumber}`)
    ) {
      plan.alreadyHere++;

      // ⚠️ **الموجود عندنا مابيتحدّثش — إلا الإلغاء.** اقرا `toCancel` فوق.
      const mine =
        ourByKey.get(String(o.shopifyOrderId)) ??
        ourByKey.get(`num:${o.orderNumber}`);
      const was = String(mine?.orderStatus ?? "");
      if (o.cancelled && mine?.id && was && !LOCKED.has(was)) {
        const tracking = String(mine.bostaTracking ?? "").trim();
        if (tracking) {
          plan.cancelledButShipped.push({
            orderNumber: o.orderNumber,
            was,
            tracking,
          });
        } else {
          plan.toCancel.push({
            id: mine.id,
            orderNumber: o.orderNumber,
            was,
            at: o.cancelledAt ?? null,
          });
        }
      }
      continue;
    }

    if (o.lines.length === 0) {
      plan.noLines.push(o.orderNumber);
      continue;
    }

    // **الأهم**: بند منتجه مش عندنا يوقف الأوردر كله
    const missing = o.lines
      .filter(
        (l) => !l.shopifyVariantId || !knownVariantIds.has(String(l.shopifyVariantId))
      )
      .map((l) => l.title);

    if (missing.length > 0) {
      plan.missingProducts.push({
        orderNumber: o.orderNumber,
        missing: [...new Set(missing)],
      });
      continue;
    }

    // العميل: برقمه عند شوبيفاي الأول، وبعدين بالتليفون
    let customerId: string | null = null;
    const sid = o.customer?.shopifyCustomerId;
    if (sid) customerId = customerByShopifyId.get(String(sid)) ?? null;
    if (!customerId) {
      const d = phoneKey(o.customer?.phone);
      if (d) customerId = customerByPhone.get(d) ?? null;
    }

    if (!customerId) {
      const key = customerKey(o);
      if (!newCustomerKeys.has(key)) {
        newCustomerKeys.add(key);
        plan.newCustomers++;
      }
    }

    const itemsTotal = o.lines.reduce(
      (s, l) => s + Number(l.quantity) * Number(l.unitPrice),
      0
    );

    plan.toImport.push({
      order: o,
      status: statusFromShopify(o),
      customerId,
      total: Math.max(0, itemsTotal - Number(o.discount ?? 0) + Number(o.shipping ?? 0)),
    });
  }

  return plan;
}

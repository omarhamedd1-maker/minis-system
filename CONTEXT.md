# Minis System — Context

> ضع هذا الملف في جذر مجلد المشروع. اقرأه أولاً قبل أي شغل.

---

## ما هو المشروع

نظام إدارة تشغيل لبراند أثاث مصري اسمه **Minis** (متجر واحد، شوبيفاي Basic).
الهدف: كل شيء أوتوماتيك بأقل تدخل يدوي — الأوردرات تنزل لوحدها من شوبيفاي،
وحالة الشحن تتحدث لوحدها من بوسطة، والداشبورد يحسب لايف.

المالك ليس مطوراً. اشرح بالعربية المصرية، وبخطوات واضحة، وبدون أسهم (→) في الشرح.

---

## الوضع الحالي (منجز بالفعل ✅)

- قاعدة البيانات مبنية بالكامل على Supabase (مشروع اسمه `Minis System`, region: West EU / Ireland)
- RLS مفعّل على كل الجداول + سياسات مكتوبة
- نظام الأدوار شغال: **Admin** (المالك فقط — يقرأ ويعدل كل شيء) و **Owner** (3 شركاء — يقرأون كل شيء، لا يعدلون أبداً)
- Edge Function اسمها `shopify-order` منشورة وشغالة — تستقبل أوردرات شوبيفاي وتوزعها على الجداول تلقائياً، وتم اختبارها بنجاح
- Webhook مضبوط في شوبيفاي على حدث `Order creation`

## المتبقي ⏳

1. **ربط بوسطة** — لتحديث حالة الشحن تلقائياً (في انتظار API access من بوسطة)
2. **الموقع (هذا الشغل)** — Next.js على Vercel

---

## الستاك

- **Database + Auth + Edge Functions:** Supabase (الباقة المجانية)
- **Frontend:** Next.js (App Router) + TypeScript
- **Hosting:** Vercel (الباقة المجانية)
- **مبدأ حاكم:** كل شيء مجاني ويظل مجاني. لا تقترح أي خدمة مدفوعة.

---

## قاعدة البيانات — 11 جدول

```
roles              — الأدوار (Admin, Owner)
app_users          — المستخدمون، مربوطون بـ auth.users عبر auth_user_id، ولكل واحد role_id
customers          — العملاء (shopify_customer_id فريد)
products           — المنتجات (shopify_product_id فريد)
product_variants   — الأشكال: cost_price, sale_price, quantity_on_hand, shopify_variant_id
orders             — الأوردرات: shopify_order_id, order_number, customer_id, order_status, order_date
order_items        — بنود كل أوردر: variant_id, quantity, sale_price_at_order, cost_price_at_order
stock_movements    — سجل حركة المخزون: change_quantity (سالب = خروج), reason, related_order_id
shipments          — الشحن: bosta_tracking_number, shipping_status, shipping_cost, last_update
expenses           — المصاريف العامة: category, description, amount, expense_date
cash_transactions  — الخزنة: direction (in/out), amount, source_type, related_order_id/expense_id
```

### العلاقات

```
customers  —<  orders  —<  order_items  >—  product_variants  >—  products
orders     —<  shipments
product_variants  —<  stock_movements
app_users  >—  roles
```

### قرارات تصميمية مهمة (لا تكسرها)

- **order_items منفصل عن orders** — الأوردر قد يحتوي أكثر من منتج. الربح يُحسب من order_items وليس من orders.
- **snapshot للأسعار** — `sale_price_at_order` و `cost_price_at_order` تُخزَّن وقت الأوردر، فتغيير سعر المنتج لاحقاً لا يغيّر أرباح أوردرات قديمة.
- **الداشبورد يُحسب لايف** — لا توجد جداول لأرقام يومية/شهرية مسجّلة. كل رقم يُحسب من orders + order_items + expenses + cash_transactions لحظياً.
- **مصدر واحد للتكلفة** — التكلفة تأتي من `product_variants.cost_price` فقط. لا تُكتب يدوياً في أي مكان آخر.
- **المخزون يتحرك تلقائياً** — عبر `stock_movements` + دالة `decrement_stock(p_variant_id, p_qty)`.

---

## الأدوار والصلاحيات

دوال SQL جاهزة في الداتابيز (SECURITY DEFINER لتجنّب recursion على app_users):

- `public.current_user_role()` — ترجع اسم دور المستخدم الحالي
- `public.is_admin()` — boolean
- `public.is_member()` — boolean (Admin أو Owner)

السياسة على كل الجداول:
- **SELECT** مسموح لـ `is_member()`
- **INSERT / UPDATE / DELETE** مسموح لـ `is_admin()` فقط

> **مهم في الواجهة:** إخفاء أزرار التعديل عن الـ Owner ليس كافياً وليس هو الحماية —
> الحماية الحقيقية في الداتابيز. لكن أخفِ الأزرار أيضاً لتجربة استخدام أنظف.

---

## الشاشات المطلوبة (ابنِ واحدة واحدة، لا تبنِ كل شيء دفعة واحدة)

1. **تسجيل الدخول** — Supabase Auth (إيميل + باسورد)
2. **الأوردرات** — قائمة + تفاصيل الأوردر (البنود، العميل، حالة الشحن)
3. **المنتجات والمخزون** — أهم شيء: تعديل `cost_price` (تنزل بصفر تلقائياً وتحتاج ملء يدوي مرة واحدة) + الكمية
4. **المصاريف** — إضافة وعرض
5. **الخزنة** — حركة الفلوس
6. **الداشبورد** — مبيعات/أرباح اليوم والشهر، محسوبة لايف

---

## ملاحظات وفخاخ معروفة

- **Verify JWT** في Edge Functions لازم يظل **OFF** للدوال التي تستقبل webhooks خارجية — والتوجل يعود ON تلقائياً بعد كل تحديث للدالة (bug معروف في Supabase). تحقق منه بعد كل deploy.
- **الحماية داخل الدالة نفسها** — التحقق من توقيع شوبيفاي (HMAC) داخل الكود، وليس عبر JWT.
- **أرقام شوبيفاي الكبيرة** — `order.id` في webhook الاختبار يتجاوز `Number.MAX_SAFE_INTEGER` فيفقد دقة. أرقام الأوردرات الحقيقية أصغر ولا تتأثر، لكن انتبه لو استخدمت أرقاماً كبيرة أخرى.
- **المنتجات تُنشأ تلقائياً** — لو جاء أوردر بمنتج غير موجود، الـ Edge Function تنشئه بتكلفة 0 ومخزون 0. لذلك شاشة المنتجات مهمة.
- **الـ service_role key** — يُستخدم في Edge Functions فقط (متاح تلقائياً كـ env var). لا تضعه أبداً في كود الفرونت إند.

---

## مفاتيح البيئة (`.env.local` — لا تُرفع على GitHub)

```
NEXT_PUBLIC_SUPABASE_URL=<Project URL من Supabase Settings > API>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

---

## أسلوب العمل المطلوب

- اشتغل على جزء صغير في كل مرة، وجرّبه، وتأكد أنه شغال، ثم انتقل للتالي.
- اشرح للمالك بالعربية المصرية وبخطوات مرقّمة بالكلمات، بدون أسهم.
- لا تقترح خدمات مدفوعة.

# صفحة التطبيق في متجر شوبيفاي — نصوص جاهزة للصق

كل حاجة هنا **مكتوبة على مقاس شوبيفاي بالحرف** (عدد الحروف اللي بيقبلوه)،
ومتحققة من متطلباتهم:
<https://shopify.dev/docs/apps/launch/app-requirements-checklist>

**الصفحة بالإنجليزي** لأن دي لغة المتجر عندهم — مش اختيار، ده شرط.

---

## ١. اسم التطبيق — الحد ٣٠ حرف

⚠️ **لازم يبدأ باسم البراند.**

**الاسم المتسجّل فعلًا:**

```
Mino - Store Operations
```

`23` حرف ✅

⚠️ **الشرطة عادية `-` مش طويلة `—`.** شوبيفاي بترفض الطويلة، وده اتأكد
بالتجربة: الاسم اللي كانت قابلاه قبل كده اترفض لما اتكتب بشرطة طويلة.

---

## ٢. التعريف (App introduction) — الحد ١٠٠ حرف

بيتكتب تحت الاسم على طول، ولازم يقول **الفايدة للتاجر** مش المميزات.

```
Run orders, shipping and profit in one place. Built for Egyptian stores.
```

`72` حرف ✅

---

## ٣. الوصف (App details) — الحد ٥٠٠ حرف

⚠️ **من غير كلام تسويقي** — شوبيفاي بترفض «الأفضل» و«الأسرع» وكلام زي ده.
وصف اللي بيعمله بس.

```
Mino brings your Shopify orders, shipping and money into one screen.

Orders sync automatically. Send a shipment to Bosta in one click, print
the waybill, and track every status change without leaving the app.

Real carrier fees are read from Bosta's own statement, not estimated, so
your profit per order is the real number. Returns, refunds and cash flow
are tracked alongside.

Built in Arabic for Egyptian stores, with team accounts and permissions.
```

`453` حرف ✅

---

## ٤. المميزات — كل واحدة الحد ٨٠ حرف

```
Sync Shopify orders automatically, with product and customer matching
Send orders to Bosta and print waybills without leaving the app
Read real Bosta fees from their statement instead of estimating
Track returns, refunds and cash in one place
Arabic interface with team accounts and per-user permissions
```

كلها تحت ٨٠ ✅

---

## ٥. الصور — ٣ لـ ٦ صور بمقاس **1600×900**

⚠️ **دي شغلك إنت.** خد صور من السيستم شغّال على متجر فيه داتا حقيقية —
شوبيفاي بترفض الصور الفاضية.

اللي يستاهل يتصوّر بالترتيب:

1. **شاشة الأوردرات** وفيها أوردرات وحالات مختلفة
2. **صفحة أوردر** وباين فيها مربع الشحن والتكلفة الحقيقية
3. **الداشبورد** بالمبيعات والأرباح
4. **شاشة المطابقة** مع فحص التغطية
5. **شاشة التاسكات**

---

## ٦. لينكات لازم تتحط

| الخانة | اللينك |
|---|---|
| Privacy policy | `https://minis-system.vercel.app/privacy` |
| App URL | `https://minis-system.vercel.app/api/shopify/install` |
| Redirect URL | `https://minis-system.vercel.app/api/shopify/callback` |
| Compliance webhooks (التلاتة) | `https://minis-system.vercel.app/api/shopify/webhooks` |

---

## ٧. المتجر التجريبي

شوبيفاي بتطلب **متجر يشوفوا فيه التطبيق شغّال**. متجر مينيز نفسه ينفع،
بس الأسلم متجر تجريبي فيه داتا مش حقيقية — مش هتحب حد يبص على أوردرات
عملائك.

---

## ٨. الصلاحيات — الرد الجاهز لو سألوا

بيسألوا «ليه محتاج الصلاحية دي؟». الرد:

| الصلاحية | الرد |
|---|---|
| `read_products` | To match order line items to products and show cost and stock. |
| `read_orders` | To import orders and the shipping address needed to create a shipment. |
| `write_orders` | To keep quantities in sync when the merchant edits an order in Mino. |
| `write_order_edits` | To apply those edits through the order editing API. |

⚠️ **والصلاحيات لازم تكون في `Scopes` مش `Optional scopes`** — دي غلطة
كلّفتنا وقت قبل كده ومكتوبة في `HANDOVER`.

---

## ٩. الترتيب

```
١. partners.shopify.com ← App distribution ← mino ← Choose distribution ← Public
٢. حط اللينكات اللي فوق في إعدادات التطبيق
٣. Create version عشان الإعدادات تشتغل
٤. املا صفحة المتجر بالنصوص اللي فوق + الصور
٥. قدّم للمراجعة
```

⚠️ **خطوة ١ مالهاش رجوع** — شوبيفاي كاتبة كده بالنص:
"You can't change the distribution method after you select it."

**✅ خطوات ١ لـ٣ اتعملوا (١١ أغسطس).** فاضل ٤ و٥.

---

## ١٠. ⛔ قبل المراجعة، التطبيق مايتركّبش على متجر برّا حسابنا

اختيار **Public** بيفتح باب التقديم بس — **مابيخليش التطبيق متاح**. لحد ما
شوبيفاي توافق وتنشره، هو متاح لمتاجر **نفس الحساب** بس.

**فمتجر عميل زي ٢ سِك مش هيعرف يركّب دلوقتي مهما عملت.** ودي مش مشكلة في
الكود ولا في الإعدادات — كلها اتفحصت واحدة واحدة.

المصدر:
<https://help.shopify.com/en/partners/help-support/faq/unpublished-app-deprecation>

**لو عايز عميل معيّن يشتغل قبل الموافقة**: تطبيق تاني بتوزيع **Custom**
على دومين متجره، وتبعتله اللينك. مالوش مراجعة، ومابندخلش حسابه.

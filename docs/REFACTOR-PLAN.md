# خطة التحسين — ٦ مراحل

> **للمساعد:** نفّذ المراحل بالترتيب. ما تبدأش مرحلة قبل ما اللي قبلها تتدمج.
> كل مرحلة = فرع + PR واحد. بعد كل PR سجّل في `docs/NEXT.md` وكمّل.

## قواعد سارية على كل المراحل

- `npm run check` لازم يخضر قبل أي دفع
- لو التعديل بيلمس صلاحيات أو عزل: كمان `node scripts/test-isolation.mjs` و`node scripts/test-new-tenant.mjs`
- **ممنوع تخلط مرحلتين في PR واحد**
- أي ملف SQL في `sql/` لازم يخلص بأوامر رجوع
- في أي حتة مكتوب فيها **قف واسأل عمر** — قف فعلًا، ما تجتهدش

---

# المرحلة ١ — نظام التصميم

**الفرع:** `design-system`

عمر حط `app/globals.css` جديد فيه توكنز وقطع جاهزة، و`docs/DESIGN.md` فيه
جدول التحويل.

### ١أ. تشغيل

- افتح كل صفحة في `app/(dashboard)` وصلّح أي حاجة اتكسرت
- **`lib/format.ts`:** شيل `className` من `ORDER_STATUS_LABELS` وحط بدالها:
  ```ts
  export function orderStatusClass(status: string) {
    return `badge badge-dot badge-${status}`;
  }
  ```
  وصلّح كل الصفحات اللي بتنادي الـ`className` القديم

### ١ب. توحيد ٥ صفحات

بالترتيب: `page.tsx` (الداشبورد) → `orders/page.tsx` → `products/page.tsx` →
`expenses/page.tsx` → `cash/page.tsx`

امشي على جدول التحويل في `docs/DESIGN.md` حرفيًا.
أعمدة الفلوس تاخد `money`، أعمدة الأرقام تاخد `num`.

### قبول ١أ و١ب

- **الخمس صفحات دي بس** نضيفة من ألوان Tailwind المباشرة
- صور قبل/بعد في الـPR

⚠️ **الـgrep على المشروع كله مش شرط هنا** — المرحلة بتوحّد خمس صفحات،
والباقي لسه بالألوان القديمة بقصد. الشرط ده مكانه آخر ١ج.

### ١ج. باقي الصفحات والمكوّنات

⚠️ **الوحدة: الصفحة + مكوّناتها (قرار المشرف، ١٤ سبتمبر — بعد الجرد).**
الجرد على main: ٨٥١ لون خام في ٥٢ من ٥٨ مكوّن، وأغلبهم بتستخدمهم **صفحة واحدة**. فتوحيد
مكوّن بعيد عن صفحته بيسيب صفحات نصها موحّد ونصها لأ. اتنين بس بيظهروا في صفحات كتير:
`AppNav` (في الـlayout) و`BackLink` (٢٣ صفحة) — ودول اتعملوا لوحدهم.

- الدفعات **٥ ملفات في كل PR** — الصفحة ومكوّناتها في نفس الدفعة
- البوابة اتقفلت بعد `.table` (#157): الأربع قطع اتجربوا في صفحات حقيقية، فمافيش قياس لكل دفعة
- اتعمل: ١٥ صفحة (#156 · #157 · #158)
- ⏸️ `hover:bg-green-700` / `hover:bg-emerald-700` بيفضلوا زي ما هما لحد ما عمر يوافق على `--success-dark`
  (`hover:opacity-90` بتبهّت الزرار كله بدل ما تغمّقه — عكس `.btn-primary:hover`)

### قبول ١ج — شرطين، كل واحد بيخضر لوحده

⚠️ grep واحد على الكل ماكانش هيخضر غير في آخر يوم — يعني مفيش إشارة تقدّم طول الطريق.

**١ج-أ — `AppNav` و`BackLink` نضاف**

```
grep -E "(bg|text|border)-(gray|slate|green|red|blue|amber|orange|purple|indigo|violet|rose|sky|cyan)-[0-9]" components/AppNav.tsx components/BackLink.tsx
```

**١ج-ب — باقي `app/` و`components/` و`lib/` نضاف**

```
grep -rE "(bg|text|border)-(gray|slate|green|red|blue|amber|orange|purple|indigo|violet|rose|sky|cyan)-[0-9]" app/ components/ lib/ --exclude=*.test.ts
```

⚠️ **`lib/` لازم يبقى في الشرط** — فيه دوال بترجّع `className` بتترسم في الصفحات:
`riskBadge` في `lib/customer-history.ts` (شارة العميل في صفحة الأوردر) و`TASK_STATUSES` في `lib/tasks.ts`
(شارة التاسك). الـgrep على `app/` و`components/` بس كان هيخضر والشارات دي لسه خام. اتصلحوا مع صفحة الأوردر.

⚠️ **الـgrep ده مابيمسكش `emerald` ولا `yellow` ولا `divide` ولا `ring`** — واتلقوا فعلًا في الشغل (`text-emerald-900` · `divide-gray-50` · `focus:ring-gray-900`). النسخة الأوسع اللي بيتشتغل بيها:

```
grep -rE "(bg|text|border|ring|divide)-(gray|slate|zinc|neutral|stone|green|emerald|lime|teal|red|rose|pink|blue|sky|cyan|amber|yellow|orange|purple|indigo|violet|fuchsia)-[0-9]" components/ app/
```
- صور قبل/بعد في كل PR

### ممنوع في المرحلة دي

أي تغيير في المنطق أو الاستعلامات أو الصلاحيات أو الأسماء.

---

# المرحلة ٢ — القايمة والتقسيم

**الفرع:** `nav-restructure`

## المشكلة

`components/AppNav.tsx` فيه **١٤ بند رئيسي**، وتحت "الأوردرات" **١٠ صفحات**
مخلوطة: طوابير شغل + تقارير + عمليات في مكان واحد. وفي تاب "تقارير" منفصل
كمان، يعني التقارير في مكانين.

## التقسيم الجديد

قسّم بالوظيفة مش بالكيان:

```
الداشبورد            /
بحث                 /search

شغل النهاردة         /work                    ← مجموعة جديدة
  محتاجة مراجعة      /orders/risky
  قبل ما ترجع        /orders/rescue
  مراجعة الشحنات     /orders/reconcile
  سلات متروكة        /orders/carts
  متابعة بعد التسليم /orders/followup
  التاسكات           /tasks

الأوردرات            /orders
  أوردر جديد         /orders/new
  المرتجعات          /orders/returns

الرسايل              /inbox

التقارير             /reports                 ← كل التقارير هنا
  صحة التشغيل        /orders/health
  خريطة المبيعات     /orders/map
  التقييمات          /orders/ratings

العملاء              /customers
  الشرايح            /customers/segments

المنتجات             /products
  الباقات            /products/bundles
  لينكات الطلب       /products/links

الحسابات             /cash                    ← مجموعة جديدة
  المصاريف           /expenses
  الموردين           /suppliers

الإدارة              /settings                ← مجموعة جديدة
  المستخدمون         /users
  سجل النشاط         /users/activity
  قواعد التنبيه      /settings/rules

البيزنسات            /platform
```

**من ١٤ بند لـ١١.** والمسارات ما تتغيرش — التغيير في القايمة بس، فمفيش لينكات بتتكسر.

## صفحة `/work` الجديدة

صفحة واحدة فيها كل الطوابير، كل واحد ككرت بعدّاد:

```
┌──────────────────────┐  ┌──────────────────────┐
│ محتاجة مراجعة     ٧ │  │ قبل ما ترجع       ٣ │
└──────────────────────┘  └──────────────────────┘
```

الكرت اللي عدّاده صفر يبقى باهت. الكروت مرتبة بالأهمية مش بالأبجدية.
دي بتبقى أول صفحة يفتحها الموظف الصبح.

## الأسماء

الأسماء الحالية جُمل مش عناوين. بدّل:

| القديم | الجديد |
|---|---|
| محتاجة نظرة | محتاجة مراجعة |
| اتصل قبل ما ترجع | قبل ما ترجع |
| بتبيع فين | خريطة المبيعات |
| اسأل بعد التسليم | متابعة بعد التسليم |

## حاجات تانية في نفس المرحلة

- **`PRIMARY_HREFS` المكتوبة بالإيد** في `AppNav` — بدّلها بحقل `primary: true`
  على البند نفسه، عشان يبقى مصدر واحد للأهمية بدل قايمتين
- **الصفحات اليتيمة** — الكود نفسه مكتوب فيه مرتين "كانت صفحة يتيمة من غير
  مدخل في القايمة". ضيف اختبار بيتأكد إن كل `page.tsx` في `app/(dashboard)`
  ليها مدخل في `ITEMS` أو متسجّلة كصفحة تفاصيل، وبيقع لو ظهرت صفحة يتيمة جديدة

### القبول

- ١١ بند رئيسي بالظبط (منهم «البيزنسات» لصاحب المنصة بس)
- `/work` شغّالة وبعدّادات صح
- اختبار الصفحات اليتيمة موجود وخضر
- صفر مسارات اتغيرت

---

# المرحلة ٣ — توحيد الاسم

**الفرع:** `rename-gridpoint`

دلوقتي فيه **٣ أسماء شغالين**: `مينيز` في README، `Gridpoint` في الكود،
`minis-system` في الريبو، `minis-in` في CSS، `omar+minis@` في الإيميلات.

- وحّد كل النصوص المعروضة على **Gridpoint**
- `minis-in` في CSS → `gp-in` (الاتنين موجودين دلوقتي — شيل القديم بعد ما تبدّل كل النداءات)
- README يتكتب بالاسم الجديد

### ⚠️ قف واسأل عمر قبل

- تلمس بادئة الإيميلات `omar+minis@` — دي في حسابات شغالة فعلًا
- تغيّر اسم الريبو أو الدومين

### القبول

`grep -ri "minis" --exclude-dir=.git .` ما يرجعش غير الحاجات اللي عمر وافق تفضل.

---

# المرحلة ٤ — تقسيم الملفات الضخمة

**الفرع:** `split-large-files`

| الملف | السطور |
|---|---|
| `app/(dashboard)/orders/[id]/actions.ts` | ١٧٦٦ |
| `app/(dashboard)/orders/[id]/page.tsx` | ١٧٢٣ |
| `app/(dashboard)/page.tsx` | ٩٥١ |
| `app/(dashboard)/orders/page.tsx` | ٨٩٧ |

**واحد في كل PR.** ابدأ بـ`actions.ts`.

⚠️ **`lib/bosta/sync.ts` (٩٥٩ سطر) مستثنى بقصد** — المرحلة ٦ بتنقل
الملف ده كله لـ`lib/couriers/bosta/`. تقسيمه هنا معناه تقسيم ملف
لحتت وبعدين نقل الحتت، فبيتساب للمرحلة ٦.

المقصود نقل مش إعادة كتابة — الدوال زي ما هي، بس في ملفات متخصصة:
`actions/status.ts` · `actions/items.ts` · `actions/shipping.ts` · `actions/returns.ts`.
وبعدين `page.tsx` تتقسم لمكوّنات في `app/(dashboard)/orders/[id]/_components/`.

**الهدف: مفيش ملف فوق ٤٠٠ سطر.**

### القبول

- صفر تغيير في السلوك — نفس الاختبارات بتعدي من غير تعديل
- كل ملف جديد تحت ٤٠٠ سطر

---

# المرحلة ٥ — مراجعة الداتابيز

**الفرع:** `db-cleanup` — ملفات SQL في `sql/` بأوامر رجوع، وعمر بيشغّلها بإيده.

| # | المشكلة | الإصلاح |
|---|---|---|
| ١ | العنوان متخزن مرتين: `address` نص كامل **و** `city`/`zone`/`street`/`building`/`floor`/`apartment`/`landmark` | **قف واسأل عمر** أنهي واحدة هي الأصل |
| ٢ | العنوان على العميل بس — مفيش عنوان على الأوردر | ضيف عنوان تسليم على الأوردر، والعميل يبقى عنده الافتراضي |
| ٣ | `cash_transactions` فيها `note` **و** `description` | ادمجهم في واحد |
| ٤ | مفيش `updated_at` في أي جدول | ضيفه + trigger على الجداول اللي بتتعدّل |
| ٥ | `automation_rules` فيها `trigger` و`threshold` بس — **فين الـaction؟** والقاعدة مالهاش اسم | ضيف `name` و`action` |
| ٦ | `app_users` فيها `role_id` **و** `permissions` — نظامين صلاحيات مع بعض | **قف واسأل عمر** مين الأصل لو اتعارضوا |
| ٧ | `customers.shopify_customer_id` مربوط بمنصة واحدة | `external_source` + `external_id` |

⚠️ **كان فيه بند تامن اتشال: «`deletion_requests` مفيهاش `tenant_id`»**
— النقطة دي كانت **غلط**. العمود موجود من `sql/tenants-01-columns.sql`
(الجدول جوّه قايمة الجداول اللي بتاخد `tenant_id` وفهرس وRLS)،
واتأكد من الإنتاج، والكود بيفلتر بيه فعلًا في
`app/(dashboard)/orders/page.tsx`. اتسجّلت هنا عشان ماتترجعش تاني.

### القبول

- حارس العزل بيغطي كل جدول فيه `tenant_id`
- `node scripts/test-isolation.mjs` و`test-new-tenant.mjs` خضر
- كل ملف SQL فيه أوامر رجوع مجرّبة

---

# المرحلة ٦ — فصل شركة الشحن

**الفرع:** `courier-abstraction` — **أصعب مرحلة. ما تبدأهاش قبل ١–٥ يتدمجوا.**

## ليه

بوسطة متحوّطة جوّه المنتج: جدول اسمه `bosta_cashouts`، مجلد `lib/bosta`،
مكوّنات اسمها `BostaMark` و`BostaCoverage` و`SendBostaRowButton`، ومسارات
`/api/bosta`. **ده اللي واقف قدام بيع السيستم لأي حد بيشتغل بشركة تانية.**

## الشكل المطلوب

```
lib/couriers/
  types.ts        ← الواجهة اللي كل شركة بتنفّذها
  registry.ts     ← بيختار الشركة حسب إعداد البيزنس
  bosta/          ← الكود الحالي، منقول زي ما هو
```

الواجهة على الأقل: `createShipment` · `trackShipment` · `cancelShipment` ·
`getRates` · `syncStatuses` · `mapStatus`.

**كل شركة بتترجم حالاتها لحالاتنا الـ١٢.** الترجمة جوّه مجلد الشركة، ومحدش
برّه يعرف حاجة عن حالات بوسطة.

## الأعمدة اللي اسمها بوسطة

⚠️ **دي أكبر حتة في المرحلة، وكانت ناقصة من الخطة الأصلية.**

**١٢ عمود في `orders`** — وده أكتر جدول بيتقرا في السيستم:

```
bosta_state · bosta_cod · bosta_collected · bosta_tracking
bosta_shipping_cost · bosta_exception · bosta_created_at
bosta_stale_alerted_day · bosta_fees_real · bosta_ship_fee_real
bosta_fees_at · bosta_cod_sent
```

**٣ في `tenant_credentials`**: `bosta_api_key` · `bosta_pickup_address_id`
· `bosta_webhook_token` — دول مفاتيح ربط، بيروحوا لجدول `couriers` مش
بيتسمّوا `courier_*`.

**١ في `shipments`**: `bosta_tracking_number`.

(الأرقام دي اتقريت من الإنتاج. أي رقم تاني في أي نسخة أقدم من الخطة
مايتبنيش عليه.)

### القرار: إعادة تسمية في المكان

أعمدة `orders` يتغيّر اسمها لـ`courier_*` **في مكانها** — مش تتنقل
لجدول `shipments` منفصل.

**السبب:** إعادة التسمية ميكانيكية وآمنة، أما استخراج جدول فبيغيّر
المعنى وبيخاطر بالـtrigger اللي بيحمي `returned_after_delivery`.
**ما نعملش حاجتين صعبين مع بعض.**

فكرة جدول `shipments` المنفصل تتسجّل في `docs/BACKLOG.md` لمرحلة بعدين.

## باقي الداتابيز

| القديم | الجديد |
|---|---|
| `bosta_cashouts` | `courier_payouts` + `courier_id` |
| مفاتيح بوسطة في `tenant_credentials` | جدول `couriers` لكل بيزنس |

## الأسماء

`BostaMark` → `CourierMark` · `BostaCoverage` → `CourierCoverage` ·
`SendBostaRowButton` → `SendShipmentButton` · `/api/bosta/*` → `/api/couriers/[provider]/*`
(خلّي القديم يحوّل للجديد فترة عشان الـwebhooks المسجّلة عند بوسطة ما تقعش)

### ⚠️ قف واسأل عمر قبل

- تلمس أي webhook مسجّل عند بوسطة
- تشغّل SQL بيغيّر اسم جدول فيه بيانات

### القبول

- `grep -ri "bosta" app/ lib/ components/` ما يرجعش غير جوّه
  `lib/couriers/bosta/` **وملفات الترحيل** (`sql/` وأي كود بيقرا الأسماء
  القديمة فترة انتقالية)
- كل الاختبارات خضر
- `docs/` فيه شرح "إزاي تضيف شركة شحن جديدة"

---

## بعد الستة

`docs/BACKLOG.md` — والمواضيع المقفولة في آخر `docs/NEXT.md` ما تتفتحش.

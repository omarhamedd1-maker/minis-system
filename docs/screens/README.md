# لقطات شاشة Gridpoint

للمراجعة التصميمية بعد المرحلة ١ (نظام التصميم). اتصوّرت من `main` بعد #177 (المرحلة ١ خضرت).

- **البيانات:** البيزنس التجريبي «Mino Demo Store» — بيانات وهمية بالكامل. مفيش ولا صورة من مينيز أو ٢ سِك.
- **المقاسات:** ديسكتوب 1440 عرض · موبايل 390 عرض. الصفحة كلها لحد آخرها (مش الشاشة الأولى بس)، إلا الحالات اللي فيها قايمة أو شيت مفتوح فهي بمقاس الشاشة (1440×900 و390×844).
- **العدد:** 129 صورة من 133 · الحجم 13.5 MB.
- **التسمية:** `{الصفحة}-{desktop|mobile}.png` والحالات `{الصفحة}-{الحالة}-{desktop|mobile}.png`.

## الفهرس

| اللقطة | بتعرض إيه | المسار | ديسكتوب | طول | موبايل | طول | ملاحظات |
|---|---|---|---|---|---|---|---|
| track | صفحة تتبع الشحنة اللي العميل بيفتحها (أوردر اتشحن) | `/track/:id` | [track-desktop.png](track-desktop.png) | 900px | [track-mobile.png](track-mobile.png) | 844px |  |
| rate | صفحة تقييم الأوردر — قبل ما العميل يقيّم | `/r/:id` | [rate-desktop.png](rate-desktop.png) | 900px | [rate-mobile.png](rate-mobile.png) | 844px |  |
| rate-done | صفحة التقييم لأوردر اتقيّم خلاص | `/r/:id` | [rate-done-desktop.png](rate-done-desktop.png) | 900px | [rate-done-mobile.png](rate-done-mobile.png) | 844px |  |
| login | صفحة الدخول العامة | `/login` | [login-desktop.png](login-desktop.png) | 900px | [login-mobile.png](login-mobile.png) | 844px |  |
| login-store | باب دخول متجر معيّن (Mino Demo) | `/login/demo` | [login-store-desktop.png](login-store-desktop.png) | 900px | [login-store-mobile.png](login-store-mobile.png) | 844px |  |
| signup | صفحة التسجيل | `/signup` | [signup-desktop.png](signup-desktop.png) | 900px | [signup-mobile.png](signup-mobile.png) | 844px |  |
| privacy | سياسة الخصوصية | `/privacy` | [privacy-desktop.png](privacy-desktop.png) | 900px | [privacy-mobile.png](privacy-mobile.png) | 844px |  |
| home-push-prompt | الرئيسية وطلب تشغيل إشعارات الموبايل ظاهر (أول مرة على الجهاز) | `/` | [home-push-prompt-desktop.png](home-push-prompt-desktop.png) | 900px | [home-push-prompt-mobile.png](home-push-prompt-mobile.png) | 844px |  |
| home | الرئيسية — فترة «النهارده» (التجريبي مالوش أوردرات النهارده فالأرقام صفر) | `/` | [home-desktop.png](home-desktop.png) | 3,198px | [home-mobile.png](home-mobile.png) | 4,436px |  |
| home-3m | الرئيسية — آخر ٣ شهور بأرقام حقيقية | `/?period=3m` | [home-3m-desktop.png](home-3m-desktop.png) | 3,536px | [home-3m-mobile.png](home-3m-mobile.png) | 4,772px |  |
| home-notifications | الرئيسية وقايمة الإشعارات مفتوحة | `/` | [home-notifications-desktop.png](home-notifications-desktop.png) | 900px | [home-notifications-mobile.png](home-notifications-mobile.png) | 844px |  |
| home-more-sheet | شيت «المزيد» في شريط الموبايل | `/` | — | — | [home-more-sheet-mobile.png](home-more-sheet-mobile.png) | 844px |  |
| orders | قايمة الأوردرات | `/orders` | [orders-desktop.png](orders-desktop.png) | 3,683px | [orders-mobile.png](orders-mobile.png) | 8,546px |  |
| orders-empty | قايمة الأوردرات ببحث مالوش نتيجة | `/orders?q=zzzzzz-no-match` | [orders-empty-desktop.png](orders-empty-desktop.png) | 900px | [orders-empty-mobile.png](orders-empty-mobile.png) | 844px |  |
| order-new | صفحة أوردر قبل الشحن (جديد) | `/orders/:id` | [order-new-desktop.png](order-new-desktop.png) | 1,809px | [order-new-mobile.png](order-new-mobile.png) | 2,297px |  |
| order-shipped | صفحة أوردر اتشحن | `/orders/:id` | [order-shipped-desktop.png](order-shipped-desktop.png) | 1,802px | [order-shipped-mobile.png](order-shipped-mobile.png) | 2,272px |  |
| order-awaiting-action | صفحة أوردر واقف عند بوسطة ومحتاج تصرّف | `/orders/:id` | [order-awaiting-action-desktop.png](order-awaiting-action-desktop.png) | 1,864px | [order-awaiting-action-mobile.png](order-awaiting-action-mobile.png) | 2,206px |  |
| order-returned | صفحة أوردر مرتجع | `/orders/:id` | [order-returned-desktop.png](order-returned-desktop.png) | 2,040px | [order-returned-mobile.png](order-returned-mobile.png) | 2,579px |  |
| order-returned-after-delivery | صفحة أوردر مرتجع بعد التسليم (فلوس لازم ترجع) | `/orders/:id` | [order-returned-after-delivery-desktop.png](order-returned-after-delivery-desktop.png) | 2,316px | [order-returned-after-delivery-mobile.png](order-returned-after-delivery-mobile.png) | 3,009px |  |
| order-delivered | صفحة أوردر اتسلّم | `/orders/:id` | [order-delivered-desktop.png](order-delivered-desktop.png) | 1,895px | [order-delivered-mobile.png](order-delivered-mobile.png) | 2,279px |  |
| orders-new | إضافة أوردر يدوي | `/orders/new` | [orders-new-desktop.png](orders-new-desktop.png) | 1,050px | [orders-new-mobile.png](orders-new-mobile.png) | 1,386px |  |
| orders-carts | السلات المتروكة | `/orders/carts` | [orders-carts-desktop.png](orders-carts-desktop.png) | 900px | [orders-carts-mobile.png](orders-carts-mobile.png) | 844px |  |
| orders-followup | اسأل بعد التسليم | `/orders/followup` | [orders-followup-desktop.png](orders-followup-desktop.png) | 2,080px | [orders-followup-mobile.png](orders-followup-mobile.png) | 2,156px |  |
| orders-health | صحة الأوردرات | `/orders/health` | [orders-health-desktop.png](orders-health-desktop.png) | 1,849px | [orders-health-mobile.png](orders-health-mobile.png) | 2,485px |  |
| orders-map | خريطة المبيعات | `/orders/map` | [orders-map-desktop.png](orders-map-desktop.png) | 900px | [orders-map-mobile.png](orders-map-mobile.png) | 844px |  |
| orders-ratings | التقييمات | `/orders/ratings` | [orders-ratings-desktop.png](orders-ratings-desktop.png) | 900px | [orders-ratings-mobile.png](orders-ratings-mobile.png) | 844px |  |
| orders-reconcile | مطابقة بوسطة | `/orders/reconcile` | [orders-reconcile-desktop.png](orders-reconcile-desktop.png) | 2,364px | [orders-reconcile-mobile.png](orders-reconcile-mobile.png) | 2,740px |  |
| orders-rescue | اتصل قبل ما ترجع | `/orders/rescue` | [orders-rescue-desktop.png](orders-rescue-desktop.png) | 900px | [orders-rescue-mobile.png](orders-rescue-mobile.png) | 844px |  |
| orders-returns | المرتجعات | `/orders/returns` | [orders-returns-desktop.png](orders-returns-desktop.png) | 935px | [orders-returns-mobile.png](orders-returns-mobile.png) | 1,155px |  |
| orders-risky | محتاجة نظرة | `/orders/risky` | [orders-risky-desktop.png](orders-risky-desktop.png) | 900px | [orders-risky-mobile.png](orders-risky-mobile.png) | 844px |  |
| customers | العملاء | `/customers` | [customers-desktop.png](customers-desktop.png) | 11,512px | [customers-mobile.png](customers-mobile.png) | 24,510px | ديسكتوب: اتقصّت عند 10000px من 11512px · موبايل: اتقصّت عند 10000px من 24510px |
| customers-empty | العملاء ببحث مالوش نتيجة | `/customers?q=zzzzzz-no-match` | [customers-empty-desktop.png](customers-empty-desktop.png) | 900px | [customers-empty-mobile.png](customers-empty-mobile.png) | 844px |  |
| customer | صفحة عميل | `/customers/:id` | [customer-desktop.png](customer-desktop.png) | 1,030px | [customer-mobile.png](customer-mobile.png) | 1,673px |  |
| customer-edit | صفحة عميل وفورم التعديل مفتوح | `/customers/:id` | [customer-edit-desktop.png](customer-edit-desktop.png) | 1,100px | [customer-edit-mobile.png](customer-edit-mobile.png) | 1,835px |  |
| customers-segments | شرايح العملاء | `/customers/segments` | [customers-segments-desktop.png](customers-segments-desktop.png) | 3,204px | [customers-segments-mobile.png](customers-segments-mobile.png) | 3,284px |  |
| products | المنتجات | `/products` | [products-desktop.png](products-desktop.png) | 2,845px | [products-mobile.png](products-mobile.png) | 3,037px |  |
| products-empty | المنتجات ببحث مالوش نتيجة | `/products?q=zzzzzz-no-match` | [products-empty-desktop.png](products-empty-desktop.png) | 900px | [products-empty-mobile.png](products-empty-mobile.png) | 844px |  |
| product | صفحة منتج | `/products/:id` | [product-desktop.png](product-desktop.png) | 916px | [product-mobile.png](product-mobile.png) | 1,329px |  |
| products-bundles | الباقات | `/products/bundles` | [products-bundles-desktop.png](products-bundles-desktop.png) | 900px | [products-bundles-mobile.png](products-bundles-mobile.png) | 844px |  |
| products-bundles-form | الباقات وفورم «باقة جديدة» مفتوح | `/products/bundles` | [products-bundles-form-desktop.png](products-bundles-form-desktop.png) | 965px | [products-bundles-form-mobile.png](products-bundles-form-mobile.png) | 1,131px |  |
| products-links | لينكات الأوردر | `/products/links` | [products-links-desktop.png](products-links-desktop.png) | 974px | [products-links-mobile.png](products-links-mobile.png) | 1,070px |  |
| expenses | المصاريف — فورم التسجيل في أول الصفحة | `/expenses` | [expenses-desktop.png](expenses-desktop.png) | 900px | [expenses-mobile.png](expenses-mobile.png) | 915px |  |
| expenses-edit | المصاريف ومصروف مفتوح للتعديل | `/expenses?edit=:id` | [expenses-edit-desktop.png](expenses-edit-desktop.png) | 900px | [expenses-edit-mobile.png](expenses-edit-mobile.png) | 915px |  |
| expenses-empty | المصاريف بتصنيف مالوش حركات | `/expenses?cat=zzzzzz-no-match` | [expenses-empty-desktop.png](expenses-empty-desktop.png) | 900px | [expenses-empty-mobile.png](expenses-empty-mobile.png) | 850px |  |
| cash | الخزنة | `/cash` | [cash-desktop.png](cash-desktop.png) | 5,018px | [cash-mobile.png](cash-mobile.png) | 8,135px |  |
| suppliers | الموردين | `/suppliers` | [suppliers-desktop.png](suppliers-desktop.png) | 900px | [suppliers-mobile.png](suppliers-mobile.png) | 844px |  |
| suppliers-add | الموردين وفورم «إضافة مورد» مفتوح | `/suppliers` | [suppliers-add-desktop.png](suppliers-add-desktop.png) | 900px | [suppliers-add-mobile.png](suppliers-add-mobile.png) | 844px |  |
| supplier | صفحة مورد — فورم إضافة حركة (فاتورة/دفعة) ظاهر | `/suppliers/:id` | [supplier-desktop.png](supplier-desktop.png) | 1,139px | [supplier-mobile.png](supplier-mobile.png) | 1,639px |  |
| supplier-payment | صفحة مورد وفورم الحركة على «دفعة» | `/suppliers/:id` | [supplier-payment-desktop.png](supplier-payment-desktop.png) | 983px | [supplier-payment-mobile.png](supplier-payment-mobile.png) | 1,469px |  |
| tasks | التاسكات | `/tasks` | [tasks-desktop.png](tasks-desktop.png) | 900px | [tasks-mobile.png](tasks-mobile.png) | 844px |  |
| tasks-add | التاسكات وفورم «تاسك جديد» مفتوح | `/tasks` | [tasks-add-desktop.png](tasks-add-desktop.png) | 928px | [tasks-add-mobile.png](tasks-add-mobile.png) | 1,052px |  |
| task | صفحة تاسك بخطوات وتعليقات | `/tasks/:id` | [task-desktop.png](task-desktop.png) | 900px | [task-mobile.png](task-mobile.png) | 1,001px |  |
| inbox | صندوق الرسايل | `/inbox` | [inbox-desktop.png](inbox-desktop.png) | 900px | [inbox-mobile.png](inbox-mobile.png) | 844px |  |
| inbox-empty | صندوق الرسايل — المؤرشف (فاضي) | `/inbox?archived=1` | [inbox-empty-desktop.png](inbox-empty-desktop.png) | 900px | [inbox-empty-mobile.png](inbox-empty-mobile.png) | 844px |  |
| conversation | محادثة واتساب | `/inbox/:id` | [conversation-desktop.png](conversation-desktop.png) | 900px | [conversation-mobile.png](conversation-mobile.png) | 844px |  |
| reports | التقارير | `/reports` | [reports-desktop.png](reports-desktop.png) | 951px | [reports-mobile.png](reports-mobile.png) | 1,119px |  |
| search | البحث من غير كلمة | `/search` | [search-desktop.png](search-desktop.png) | 900px | [search-mobile.png](search-mobile.png) | 844px |  |
| search-results | البحث بنتايج | `/search?q=%D8%A8%D8%B1%D9%88%D8%A7%D8%B2` | [search-results-desktop.png](search-results-desktop.png) | 900px | [search-results-mobile.png](search-results-mobile.png) | 844px |  |
| search-empty | البحث مالوش نتيجة | `/search?q=zzzzzz-no-match` | [search-empty-desktop.png](search-empty-desktop.png) | 900px | [search-empty-mobile.png](search-empty-mobile.png) | 844px |  |
| settings | الإعدادات | `/settings` | [settings-desktop.png](settings-desktop.png) | 1,613px | [settings-mobile.png](settings-mobile.png) | 1,792px |  |
| settings-rules | قواعد التنبيه | `/settings/rules` | [settings-rules-desktop.png](settings-rules-desktop.png) | 1,145px | [settings-rules-mobile.png](settings-rules-mobile.png) | 1,199px |  |
| users | المستخدمين | `/users` | [users-desktop.png](users-desktop.png) | 900px | [users-mobile.png](users-mobile.png) | 844px |  |
| users-editor | المستخدمين وكارت مستخدم مفتوح | `/users` | [users-editor-desktop.png](users-editor-desktop.png) | 1,765px | [users-editor-mobile.png](users-editor-mobile.png) | 3,027px |  |
| users-activity | سجل النشاط | `/users/activity` | [users-activity-desktop.png](users-activity-desktop.png) | 4,451px | [users-activity-mobile.png](users-activity-mobile.png) | 4,767px |  |
| platform | البيزنسات (أدمن المنصة) | `/platform` | ✗ | — | ✗ | — | ديسكتوب: اتحوّلت لـ/ بدل /platform · موبايل: اتحوّلت لـ/ بدل /platform |
| platform-tenant | صفحة بيزنس (أدمن المنصة) | `/platform/:id` | ✗ | — | ✗ | — | ديسكتوب: اتحوّلت لـ/ بدل /platform/d073ed5e-d2b3-4f96-8c1b-cd00d2869f9f · موبايل: اتحوّلت لـ/ بدل /platform/d073ed5e-d2b3-4f96-8c1b-cd00d2869f9f |
| no-access | شاشة «مفيش صلاحيات» | `/no-access` | [no-access-desktop.png](no-access-desktop.png) | 900px | [no-access-mobile.png](no-access-mobile.png) | 844px |  |

⚠️ **الطول** = طول الصفحة كلها بالبكسل (الحالات اللي بمقاس الشاشة بس طولها = الشاشة). الصورة بتتقص عند 10,000px، والطول الكامل مكتوب برضه.

## أطول الصفحات

اللي عدّت 5,000px على الموبايل (≈ ٦ شاشات تمرير) — مرشحة إن القايمة بتجيب كل الصفوف من غير تقسيم صفحات:

| الصفحة | موبايل | شاشات تمرير (844) | ديسكتوب |
|---|---|---|---|
| customers | 24,510px | 29 | 11,512px |
| orders | 8,546px | 10 | 3,683px |
| cash | 8,135px | 10 | 5,018px |


### القوايم: بتجيب كام صف وبتقطع ولا لأ (من الكود، ١٤ سبتمبر)

طول صفحة العملاء (٢٣٠ عميل = 24,510px على الموبايل) سببه إن القايمة بتترسم كلها. ده الوضع في باقي القوايم:

| الصفحة | أقصى صفوف بتتجاب | بتقطع؟ |
|---|---|---|
| `/orders` | 3000 للبحث | ✅ 50 وزرار «عرض المزيد» |
| `/users/activity` | حسب `limit` | ✅ زرار «عرض المزيد» |
| `/products` | 2000 · 4000 | ✅ «اعرض الكل» |
| `/cash` | 100 | حد ثابت — آخر ١٠٠ حركة بس |
| `/customers` | 1000 | ❌ كلهم في صفحة واحدة |
| `/expenses` | 2000 · 5000 | ❌ كلهم في صفحة واحدة |
| `/orders/returns` | 1000 · 3000 | ❌ |
| `/orders/ratings` | 1000 | ❌ |
| `/orders/followup` | 500 | ❌ |
| `/tasks` | 500 | ❌ |
| `/inbox` | 300 | ❌ |
| `/customers/segments` | 5000 | ❌ |
| `/suppliers` | من غير حد | ❌ |

## ماتصوّرش أو اتصوّر بشكل ناقص — والسبب

- `customers-desktop.png` (`/customers`): اتصوّر، بس — اتقصّت عند 10000px من 11512px
- `customers-mobile.png` (`/customers`): اتصوّر، بس — اتقصّت عند 10000px من 24510px
- `platform-desktop.png` (`/platform`): ✗ ماتصوّرش — اتحوّلت لـ/ بدل /platform
- `platform-mobile.png` (`/platform`): ✗ ماتصوّرش — اتحوّلت لـ/ بدل /platform
- `platform-tenant-desktop.png` (`/platform/:id`): ✗ ماتصوّرش — اتحوّلت لـ/ بدل /platform/d073ed5e-d2b3-4f96-8c1b-cd00d2869f9f
- `platform-tenant-mobile.png` (`/platform/:id`): ✗ ماتصوّرش — اتحوّلت لـ/ بدل /platform/d073ed5e-d2b3-4f96-8c1b-cd00d2869f9f

### حاجات معروفة عن البيانات

- **البيانات اتزرعت عشان كل صفحة تبان مليانة (١٤ سبتمبر):** ٤٥ أوردر من ١٢ أغسطس لحد يوم التصوير بكل الحالات، موردين بفواتير ودفعات، تاسكات بخطوات وتعليقات، محادثات واتساب وإنستجرام وماسنجر، تقييمات، باقات، قواعد تنبيه، لينكات أوردر، وطلب حذف. أسماء المنتجات والأشكال اتحولت عربي.
- **صفحة التتبع إنجليزي بقصد** — قرار عمر مكتوب في `lib/tracking-copy.ts`: دي الصفحة الوحيدة اللي العميل بيقراها، ونبرتها نبرة متجر. مش غلط لغة في التصوير.
- **السلات المتروكة** بتتجاب من شوبيفاي لحظتها، والتجريبي مش مربوط بمتجر — فالصفحة فاضية.
- **صندوق الرسايل** المحادثات فيه مزروعة في الداتابيز بس — مفيش ربط Meta حقيقي، فالرد الفعلي مش شغال.
- **البيزنسات (`/platform`)** لأدمن المنصة بس، والحساب التجريبي مش أدمن منصة.
- **فورم تسجيل المصروف** و**فورم حركة المورد** ظاهرين على طول في صفحتهم (مش مودال) — `expenses` و`supplier`. التعديل المفتوح في `expenses-edit` والدفعة في `supplier-payment`.
- **صفحة ربط الأوردر (`/o/:id`)** ماتصوّرتش — محتاجة لينك أوردر متولّد، والتجريبي مافيهوش.

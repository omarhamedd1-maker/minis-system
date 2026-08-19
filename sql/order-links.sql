-- ==========================================================================
-- لينكات الطلب المباشر
-- --------------------------------------------------------------------------
-- لينك واحد لكل منتج (أو شكل) بتبعته للعميل في رسالة، هو يملا عنوانه ويأكّد،
-- والأوردر يتعمل عندك في «محتاج تأكيد».
--
-- ⚠️⚠️ **السعر مش في اللينك** — بيتقرا من المنتج وقت الطلب. لو كان في اللينك
-- كان أي حد يقدر يعدّله ويطلب بجنيه.
--
-- ⚠️ **واللينك بيتقفل مش بيتمسح** (`active`) — اللينكات اللي اتبعتت في رسايل
-- قديمة لازم تفضل تفتح وتقول «العرض ده خلص» بدل ما تدي صفحة مكسورة.
-- ==========================================================================

create table if not exists order_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  /** ملاحظة لصاحب المتجر بس — «لينك ستوري إنستجرام» */
  note text,
  active boolean not null default true,
  /** كام أوردر جه من اللينك ده */
  orders_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_links_tenant_idx
  on order_links (tenant_id, created_at desc);

-- ⚠️ **الجدول مقفول** — الصفحة العامة بتقراه بمفتاح الأدمن **بالمعرّف**
-- (`uuid` مالوش تخمين)، وصاحب المتجر بيقراه من السيرفر. مافيش قراية من
-- المتصفح خالص.
alter table order_links enable row level security;


-- ==========================================================================
-- صورة المنتج من شوبيفاي
-- --------------------------------------------------------------------------
-- ⚠️ **الصورة الأساسية بس** (`featuredMedia`) — دي اللي العميل شافها وهو
-- بيشتري، وبتظهر في قايمة المنتجات وفي صفحة الطلب المباشر.
--
-- ⚠️ **والرابط بيتخزّن مش الصورة** — شوبيفاي بتستضيفها، وتخزينها عندنا
-- معناه مساحة وتكلفة على حاجة موجودة خلاص.
-- ==========================================================================

alter table products add column if not exists image_url text;


-- ==========================================================================
-- الشحن الثابت
-- --------------------------------------------------------------------------
-- الأوردر اللي جاي من لينك مباشر محتاج رقم شحن — ومافيش سلة شوبيفاي تحسبه.
--
-- ⚠️ **رقم واحد لكل مكان** — ده اللي عمر بيشتغل بيه فعلًا: مينيز بتحصّل ٩٠
-- على ٣٠٩ أوردر، و٢ سِك بتحصّل ٨٠ على ١٥٢. فرقم لكل بيزنس، مش رقم في الكود.
--
-- ⚠️ **والفاضي معناه صفر** — مش «استخدم رقم افتراضي»؛ البيزنس اللي مادخلش
-- رقم يبقى بيشحن ببلاش عن قصد.
-- ==========================================================================

alter table tenant_credentials
  add column if not exists flat_shipping_price numeric not null default 0;


-- ==========================================================================
-- بنود اللينك — أكتر من منتج في لينك واحد
-- --------------------------------------------------------------------------
-- ⚠️ **اللينك بقى سلة مش منتج.** لينك لكل منتج معناه إنك تدخل كل منتج وتعمل
-- لينك وتبعت ٥ لينكات في رسالة — والعميل يطلب واحد بس.
--
-- ⚠️ **و`variant_id` القديم في `order_links` سايب زي ما هو** — اللينكات
-- اللي اتعملت قبل كده بتفضل شغّالة، والجديد بيقرا من الجدول ده.
-- ==========================================================================

create table if not exists order_link_items (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references order_links(id) on delete cascade,
  -- ⚠️ **رقم البيزنس هنا كمان** — الجدول مربوط باللينك، بس الحارس بيطلب
  -- الخانة على كل كتابة، والتكرار ده بيمنع صف ينزل تحت بيزنس غلط.
  tenant_id uuid not null references tenants(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (link_id, variant_id)
);

create index if not exists order_link_items_link_idx
  on order_link_items (link_id);

alter table order_link_items enable row level security;

-- واسم اللينك عشان تعرفه من بين لينكاتك
alter table order_links add column if not exists title text;
-- والشكل الواحد بقى اختياري — البنود في الجدول الجديد
alter table order_links alter column variant_id drop not null;

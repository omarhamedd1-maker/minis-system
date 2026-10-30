-- ==========================================================================
-- الفتح قبل الدفع: قرار لكل أوردر + افتراضي لكل بيزنس
-- --------------------------------------------------------------------------
-- سببين:
--
-- ١) **بوسطة وقفت الإرسال.** من ١٠ أكتوبر ٢٠٢٦ أي شحنة بترجع بـ:
--    `Product images are required when allowToOpenPackage is enabled`
--    (كود ٢١٥٠ عندهم). الكود كان بيبعت `allowToOpenPackage: true` على كل
--    شحنة من غير صور. بقى بيبعت `deliveryImages` معاها.
--
-- ٢) **والفتح مش دايمًا مطلوب.** في منتجات الفتح فيها معناه إنها اترجعت.
--    فبقى قرار على كل أوردر، وله افتراضي على مستوى البيزنس.
--
-- الفاضي في الاتنين = مسموح — نفس اللي كان في الكود، فمفيش حاجة بتتغير
-- من تحت حد قبل ما يختار.
-- ==========================================================================

-- ===== ١) قرار الأوردر =====
alter table orders
  add column if not exists allow_open_package boolean;

comment on column orders.allow_open_package is
  'العميل يفتح الطرد قبل الدفع؟ فاضي = ارجع لإعداد البيزنس. بيتكتب وقت الإرسال لبوسطة.';

-- ===== ٢) افتراضي البيزنس =====
alter table tenant_credentials
  add column if not exists bosta_allow_open_package boolean not null default true;

comment on column tenant_credentials.bosta_allow_open_package is
  'الافتراضي للبيزنس: الفتح قبل الدفع. الأوردر يقدر يخالفه.';

-- ===== ٣) اتأكد =====
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where (table_name = 'orders' and column_name = 'allow_open_package')
   or (table_name = 'tenant_credentials' and column_name = 'bosta_allow_open_package');

-- ⚠️ **الصور شرط**: بوسطة بتقبل الفتح لما يبقى فيه صورة واحدة على الأقل
-- لمنتج من منتجات الأوردر (رابط https). دي عدّة المنتجات اللي عندها صورة:
select t.name as business,
       count(*) as products,
       count(*) filter (where p.image_url like 'https://%') as with_image
from products p
join tenants t on t.id = p.tenant_id
group by t.name
order by t.name;

-- ==========================================================================
-- التراجع
-- ==========================================================================
-- alter table orders drop column if exists allow_open_package;
-- alter table tenant_credentials drop column if exists bosta_allow_open_package;

-- ==========================================================================
-- مفاتيح شوبيفاي لكل بيزنس
-- ==========================================================================
-- المشكلة: مفاتيح شوبيفاي عايشة في أسرار دوال سوبابيز (متغيرات بيئة)، يعني
-- **مفتاح واحد لكل الناس**. ونتيجتها حاجتين:
--
--   ١. دوال شوبيفاي مينفعش تنتقل جوّه المشروع ولا تتختبر.
--   ٢. وأهم: **أي بيزنس تاني مش هيقدر يربط شوبيفاي من الأساس** — ده نقص
--      في المنتج مش في الكود.
--
-- الجدول فيه `shopify_shop` و`shopify_access_token` و`shopify_webhook_secret`
-- من قبل. الناقص هو بيانات التطبيق اللي بيها بنطلع التوكن كل مرة
-- (شوبيفاي بتدي توكن عمره ٢٤ ساعة، فبنعمل التبديل في كل تشغيل).
--
-- إزاي عمر يجيبهم:
--   Shopify Dev Dashboard ← التطبيق "Minis System" ← Client credentials
--   ومعاهم دومين المتجر بالشكل ده: d8rtv0-uq.myshopify.com
-- ==========================================================================

alter table tenant_credentials
  add column if not exists shopify_client_id text,
  add column if not exists shopify_client_secret text;


-- ===== تأكيد =====
--   select tenant_id,
--          shopify_shop,
--          shopify_client_id is not null as له_تطبيق,
--          shopify_client_secret is not null as له_سر
--   from tenant_credentials;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- alter table tenant_credentials
--   drop column if exists shopify_client_id,
--   drop column if exists shopify_client_secret;

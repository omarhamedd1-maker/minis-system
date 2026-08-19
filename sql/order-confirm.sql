-- ==========================================================================
-- طابور تأكيد الأوردرات
-- --------------------------------------------------------------------------
-- كل متجر بيشحن دفع-عند-الاستلام بيكلّم العميل قبل ما يبعت. اللي كان موجود
-- تنبيه يومي بيقول «فيه أوردر لسه جديد». اللي ناقص إن المكالمة نفسها تبقى
-- شغل متتبّع: اتصلت، رد ولا مردّش، وإمتى نعيد.
--
-- **والفايدة مالية مباشرة**: نسبة الرجوع عند ٢ سِك ٧٪، وكل مرتجع بيدفع شحن
-- رايح وجاي ورسوم بوسطة. المكالمة قبل الشحن هي أرخص طريقة تمنع ده.
--
-- المنطق كله في `lib/order-confirm.ts` ومتختبر.
-- ==========================================================================

alter table orders
  add column if not exists confirm_attempts integer not null default 0,
  add column if not exists confirm_next_at  timestamptz,
  add column if not exists confirm_last_at  timestamptz,
  add column if not exists confirm_note     text;

-- الطابور بيتقرا بالحالة والميعاد، فالفهرس ده بيخلّي الشاشة سريعة
-- مهما كبرت الأوردرات
create index if not exists orders_confirm_queue_idx
  on orders (tenant_id, confirm_next_at)
  where order_status = 'new';

-- شوف النتيجة
select
  count(*) filter (where order_status = 'new')            as "لسه جديد",
  count(*) filter (where confirm_attempts > 0)            as "اتصلنا بيه",
  count(*) filter (where confirm_attempts >= 3)           as "محتاج قرار"
from orders;

-- ===== للرجوع =====
--   alter table orders
--     drop column if exists confirm_attempts,
--     drop column if exists confirm_next_at,
--     drop column if exists confirm_last_at,
--     drop column if exists confirm_note;
--   drop index if exists orders_confirm_queue_idx;

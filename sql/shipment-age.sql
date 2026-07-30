-- ==========================================================================
-- عمر الشحنة — عشان نعرف إنها واقفة قبل ما تموت
-- ==========================================================================
-- اللي حصل مع أوردر أمينة فتحي: الشحنة اتعملت، المندوب مجاش، قعدت أسبوعين،
-- وبوسطة أرشفتها. وقتها خلاص — مفيش في الـAPI أي حاجة بترجّع شحنة مؤرشفة.
--
-- المشكلة إن السيستم مكانش عارف الشحنة قاعدة قد إيه، فمكانش يقدر ينبّه.
-- بوسطة بترجّع `createdAt` مع كل شحنة وإحنا مكناش بناخده.
--
--   bosta_created_at        امتى الشحنة اتعملت عند بوسطة
--   bosta_stale_alerted_day آخر مرحلة نبّهنا عليها (٣ أو ٧ أو ١٠ أو ١٣)
--                          عشان كل مرحلة تنبّه مرة واحدة بس
-- ==========================================================================

alter table orders
  add column if not exists bosta_created_at timestamptz,
  add column if not exists bosta_stale_alerted_day smallint;


-- ===== تأكيد =====
--   select order_number, order_status, bosta_created_at,
--          now() - bosta_created_at as قاعدة_قد_ايه
--   from orders
--   where bosta_created_at is not null and order_status = 'ready'
--   order by bosta_created_at;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- alter table orders
--   drop column if exists bosta_created_at,
--   drop column if exists bosta_stale_alerted_day;

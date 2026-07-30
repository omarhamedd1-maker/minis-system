-- ==========================================================================
-- تنبيه فرق التحصيل
-- ==========================================================================
-- السيستم بيدفع التحصيل لبوسطة بس لما تعدّل أوردر من الشاشة. لو الرقم اختلف
-- لأي سبب تاني، مفيش حاجة بتكتشف — والفحص لقى ١٥ أوردر بفرق ١٨ ألف جنيه.
--
--   cod_alerted_diff   آخر فرق نبّهنا عليه. عشان منزنّش كل ١٥ دقيقة على
--                      نفس الفرق، وننبّه من جديد بس لو الفرق اتغيّر.
--
--   cod_diff_ignored   الفرق مقصود (شحنة جزئية مثلًا) — بلاش تنبيه تاني.
-- ==========================================================================

alter table orders
  add column if not exists cod_alerted_diff numeric,
  add column if not exists cod_diff_ignored boolean not null default false;


-- ===== تأكيد =====
--   select order_number, order_status, bosta_cod,
--          cod_alerted_diff, cod_diff_ignored
--   from orders where cod_alerted_diff is not null;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- alter table orders
--   drop column if exists cod_alerted_diff,
--   drop column if exists cod_diff_ignored;

-- ==========================================================================
-- فلوس المرتجع — اللي إنت بترجّعها للعميل
-- ==========================================================================
-- بوسطة مابتدفعش للعميل. لما العميل يستلم وبعدين يرجّع، **إنت** اللي
-- بتحوّله فلوسه (إنستا باي أو أونلاين). والمشكلة إن الحوالة دي مالهاش
-- أي أثر في السيستم — فمفيش حاجة تقولك إنك لسه ماحوّلتش، ومفيش حاجة
-- تمنعك تحوّل مرتين.
--
--   refunded_at            امتى أكّدت إنك حوّلت
--   refunded_amount        حوّلت كام (بنحسب المقترح من البنود الراجعة)
--   refund_reminded_day    آخر مرحلة تنبيه (١ أو ٣ أو ٧ أو ١٠)
-- ==========================================================================

alter table orders
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_amount numeric,
  add column if not exists refund_reminded_day smallint;


-- ===== تأكيد =====
--   select order_number, order_status, refunded_at, refunded_amount
--   from orders
--   where order_status = 'returned_after_delivery'
--   order by order_date desc;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- alter table orders
--   drop column if exists refunded_at,
--   drop column if exists refunded_amount,
--   drop column if exists refund_reminded_day;

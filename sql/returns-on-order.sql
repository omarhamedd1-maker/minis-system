-- ==========================================================================
-- المرتجع بعد التسليم على الأوردر نفسه (قرار عمر ١٧ سبتمبر)
-- --------------------------------------------------------------------------
-- اللي موجود قبل كده (sql/refunds.sql):
--   order_items.returned_quantity   الكمية الراجعة لكل بند
--   orders.refunded_amount          المبلغ اللي اتحوّل للعميل
--   orders.refunded_at              امتى
--
-- الجديد: **حالة البضاعة الراجعة لكل بند** — رجعت للمخزون ولا تالفة.
-- التالفة مابترجعش المخزون، وتكلفتها بتفضل خسارة في حساب الربح.
-- الافتراضي «رجعت للمخزون».
--
-- والريفند بقى بيطلع حركة خزنة على الأوردر (source_type = 'refund')
-- بدل مصروف «مرتجعات» — ده في الكود، مش محتاج تغيير هنا.
--
-- ⚠️ بيضيف بس — مابيغيّرش أي صف موجود.
-- ==========================================================================

alter table order_items
  add column if not exists returned_condition text not null default 'restocked';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_returned_condition_check'
  ) then
    alter table order_items
      add constraint order_items_returned_condition_check
      check (returned_condition in ('restocked', 'damaged'));
  end if;
end $$;


-- ===== تأكيد =====
select column_name, column_default
from information_schema.columns
where table_name = 'order_items' and column_name = 'returned_condition';

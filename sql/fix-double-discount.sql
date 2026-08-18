-- ==========================================================================
-- تصحيح الخصم المخصوم مرتين — أوردر ١٣٢٣ عند ٢ سِك
-- --------------------------------------------------------------------------
-- الاستيراد كان بيقرا سعر البند من `discountedUnitPriceSet` — ده السعر
-- **بعد** الخصم — والخصم بيتخزّن كمان لوحده في `orders.discount`.
-- والحساب عندنا:
--
--     بنود − خصم + شحن
--
-- فالخصم كان بيتخصم **مرتين**، والأرباح كمان بتخصمه، فالإيراد والربح
-- الاتنين كانوا ناقصين بقيمة الخصم.
--
-- **الكود اتصلّح** (بقى `originalUnitPriceSet`)، بس الأوردر اللي دخل
-- بالغلط لازم يتظبّط بإيدنا.
--
-- **أوردر واحد بس اتأثر**: ٢ سِك رقم ١٣٢٣ — بندين سعرهم ٣٧٤٫٢٥ والصح
-- ٤٩٩، والفرق ٢٤٩٫٥ هو الخصم بالظبط.
--   عندنا دلوقتي: 2×374.25 − 249.5 + 80 = **579**
--   عند شوبيفاي:                          **828.5**
--
-- (مينيز مافيهاش ولا أوردر عليه خصم، والبيزنس التجريبي داتاه مزروعة مش
-- مستوردة من شوبيفاي.)
-- ==========================================================================

-- ١) شوف الحالة قبل — لازم يطلع صفّين بـ374.25
select oi.id, oi.quantity, oi.sale_price_at_order
from order_items oi
join orders o on o.id = oi.order_id
where o.order_number = '1323'
  and o.tenant_id = 'f2833051-6e44-4393-9878-21406986b657';

-- ٢) التصحيح
update order_items oi
set sale_price_at_order = 499
from orders o
where o.id = oi.order_id
  and o.order_number = '1323'
  and o.tenant_id = 'f2833051-6e44-4393-9878-21406986b657'
  and oi.tenant_id = 'f2833051-6e44-4393-9878-21406986b657'
  and oi.sale_price_at_order = 374.25;

-- ٣) اتأكد — لازم يطلع 828.5
select
  sum(oi.quantity * oi.sale_price_at_order)
    - coalesce(o.discount, 0)
    + coalesce(o.shipping_price, 0) as الإجمالي
from order_items oi
join orders o on o.id = oi.order_id
where o.order_number = '1323'
  and o.tenant_id = 'f2833051-6e44-4393-9878-21406986b657'
group by o.discount, o.shipping_price;

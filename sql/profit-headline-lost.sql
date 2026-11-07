-- ==========================================================================
-- التلات أرقام يقفلوا على بعضهم: الإجمالي = المبيعات + الضايع
-- --------------------------------------------------------------------------
-- على الداشبورد تلات أرقام مع بعض، وماكانوش بيطلّعوا بعض:
--
--   «المبيعات» الكبير  −  «من غير الملغي والمرتجع»  ≠  «الفرص الضايعة»
--
-- سببين:
--   ١. `gross_sales` ماكانش بيطرح الريفند، و`sales` بيطرحه.
--   ٢. و«الفرص الضايعة» كانت بتتحسب في الصفحة بسعر البضاعة الخام — من
--      غير خصم ومن غير شحن.
--
-- أرقام حقيقية: ٢ سِك في نوفمبر ٢٠٢٦ الفرق بين الرقمين الكبيرين ٨٬٣٧٧
-- و«الفرص الضايعة» كانت بتقول ٩٬٧٧٥. وعلى السنة: مينيز ٦٬٠٦٠ فرق،
-- ٢ سِك ٥٬٢٤٢، مينو ٩٬٠٧٣.
--
-- دلوقتي التلاتة بنفس المعادلة (البنود − الخصم + الشحن − الريفند)،
-- والاختلاف الوحيد بينهم هو الأوردرات الداخلة في كل واحد.
--
-- ⚠️ **الكود بيشتغل من غير الملف ده** — لو الدالة القديمة لسه موجودة،
-- `lostValue` بيتحسب بالطرح في `lib/profit-headline.ts`. بس ساعتها
-- الإجمالي لسه مش بيطرح الريفند، فالرقم بيفضل أعلى من الحقيقة بقيمة
-- المرتجع بعد التسليم.
--
-- بيستبدل الدالة اللي في `sql/profit-headline.sql` — اشتغل الملف ده بعده.
-- ==========================================================================

drop function if exists profit_headline(uuid, date, date);

create or replace function profit_headline(
  p_tenant uuid,
  p_from   date,
  p_to     date
)
returns table (
  sales                numeric,
  gross_sales          numeric,
  lost_value           numeric,
  profit               numeric,
  expenses_total       numeric,
  expenses_excluded    numeric,
  shipping_revenue     numeric,
  shipped_count        bigint,
  bosta_shipping_total numeric,
  net_shipping         numeric,
  net_profit           numeric,
  cod                  numeric,
  order_count          bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      o.id,
      o.order_status as st,
      (o.order_date at time zone 'Africa/Cairo')::date as day,
      (o.delivered_at at time zone 'Africa/Cairo')::date as delivered_day,
      coalesce(o.discount, 0) as discount,
      coalesce(o.shipping_price, 0) as ship,
      coalesce(o.bosta_cod, 0) as bosta_cod,
      coalesce(o.bosta_fees_real, o.bosta_shipping_cost, 0) as carrier,
      o.refunded_amount,
      o.refunded_at
    from orders o
    where o.tenant_id = p_tenant
  ),
  items as (
    select
      oi.order_id,
      sum(oi.quantity * oi.sale_price_at_order) as goods,
      sum(
        (oi.quantity - case
           when coalesce(oi.returned_condition, 'restocked') = 'restocked'
             then least(coalesce(oi.returned_quantity, 0), oi.quantity)
           else 0
         end) * coalesce(oi.cost_price_at_order, 0)
      ) as cost,
      -- المستحق للعميل: الراجع × سعره (`refundDue`)
      sum(least(coalesce(oi.returned_quantity, 0), oi.quantity) * oi.sale_price_at_order) as due
    from order_items oi
    group by oi.order_id
  ),
  m as (
    select
      b.*,
      coalesce(i.goods, 0) as goods,
      coalesce(i.cost, 0) as cost,
      case
        when b.st <> 'returned_after_delivery' then 0
        when b.refunded_at is not null then coalesce(b.refunded_amount, 0)
        else greatest(0, round(coalesce(i.due, 0), 2))
      end as refund
    from base b
    left join items i on i.order_id = b.id
  ),
  in_period as (
    select * from m where day between p_from and p_to
  ),
  counted as (
    -- EXCLUDED_STATUSES
    select * from in_period where st not in ('cancelled', 'returned')
  ),
  -- ⚠️ المستبعدين — نفس معادلة `counted` بالظبط، والفرق هو الحالة بس
  excluded_rows as (
    select * from in_period where st in ('cancelled', 'returned')
  ),
  carrier as (
    -- AT_CARRIER_STATUSES
    select * from in_period
    where st in ('shipped', 'out_for_delivery', 'delivered', 'awaiting_action',
                 'returning', 'returned', 'returned_after_delivery')
      and carrier > 0
  ),
  money as (
    select
      (select coalesce(sum(goods - discount + ship - refund), 0) from counted)       as sales,
      -- ⚠️ الريفند بيتطرح هنا كمان دلوقتي — من غيره الرقم مابيقفلش
      (select coalesce(sum(goods - discount + ship - refund), 0) from in_period)     as gross_sales,
      (select coalesce(sum(goods - discount + ship - refund), 0) from excluded_rows) as lost_value,
      (select coalesce(sum(goods - cost - refund - discount), 0) from counted)       as profit,
      (select count(*) from counted)                                                 as order_count,
      (select coalesce(sum(carrier), 0) from carrier)                                as bosta_total,
      (select count(*) from carrier where st <> 'returned')                          as shipped_count,
      (select coalesce(sum(ship), 0) from carrier where st <> 'returned')            as shipping_revenue,
      (select coalesce(sum(case when bosta_cod > 0 then bosta_cod else goods - discount end), 0)
         from m
        where st = 'delivered' and delivered_day between p_from and p_to)            as cod
  ),
  spent as (
    -- NOT_IN_PROFIT
    select
      coalesce(sum(amount) filter (where btrim(coalesce(category, '')) not in
        ('تصنيع وخامات', 'بضاعة', 'باقة بوسطة', 'سحوبات')), 0) as counted,
      coalesce(sum(amount) filter (where btrim(coalesce(category, '')) in
        ('تصنيع وخامات', 'بضاعة', 'باقة بوسطة', 'سحوبات')), 0) as excluded
    from expenses
    where tenant_id = p_tenant
      and expense_date between p_from and p_to
  )
  select
    money.sales,
    money.gross_sales,
    money.lost_value,
    money.profit,
    spent.counted,
    spent.excluded,
    money.shipping_revenue,
    money.shipped_count,
    money.bosta_total,
    money.bosta_total - money.shipping_revenue,
    money.profit + money.shipping_revenue - spent.counted - money.bosta_total,
    money.cod,
    money.order_count
  from money, spent;
$$;

-- ===== اتأكد إن التلاتة بيقفلوا =====
-- المفروض `فرق` يطلع صفر في كل سطر.
select t.name as business,
       h.gross_sales,
       h.sales,
       h.lost_value,
       round(h.gross_sales - h.sales - h.lost_value, 2) as فرق
from tenants t
cross join lateral profit_headline(t.id, date '2026-01-01', date '2026-12-31') h
order by t.name;

-- ==========================================================================
-- التراجع — بيرجّع الدالة زي ما كانت في sql/profit-headline.sql
-- (من غير `lost_value`، والإجمالي من غير طرح الريفند)
-- ==========================================================================
-- شغّل `sql/profit-headline.sql` تاني — هو اللي فيه النسخة القديمة كاملة.

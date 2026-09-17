-- ==========================================================================
-- أرقام الربح بتتحسب في الداتابيز — نفس `computeHeadline` بالظبط
-- --------------------------------------------------------------------------
-- ⚠️⚠️ **الصفحة كانت بتجيب كل الأوردرات ببنودها وتجمعها بنفسها** — والكروت
-- اللايف بتعمل ده كل ٢٠ ثانية. الدالة بترجّع ١٢ رقم بس.
--
-- ⚠️⚠️ **الحسبة دي نسخة من `lib/dashboard-stats.ts`.** أي تغيير هناك لازم
-- يتعمل هنا، والعكس. القوايم (الحالات والتصنيفات المستثناة) عليها حارس في
-- `lib/profit-headline.test.ts` بيقارنها بالكود — لو اختلفت الاختبار بيقع.
--
-- القواعد (اقرا الكود للسبب):
--   · المبيعات = البنود − الخصم + الشحن − الريفند · من غير الملغي والمرتجع
--     قبل التسليم (`EXCLUDED_STATUSES`)
--   · الراجع بعد التسليم: الريفند المتأكّد، ولو لسه = المستحق من البنود
--     الراجعة · وتكلفة اللي رجع الرف مابتتحسبش (`lib/returned-items.ts`)
--   · المصاريف: من غير خامات · بضاعة · باقة بوسطة · سحوبات (`NOT_IN_PROFIT`)
--   · تكلفة بوسطة: الحقيقي لو موجود وإلا التقدير · على الحالات اللي عدّت
--     على المندوب (`AT_CARRIER_STATUSES`)
--   · التحصيل: المتسلّم بتاريخ التسليم
--   · التواريخ بتوقيت القاهرة
--
-- ⚠️ **security invoker** — قاعدة العزل بتتطبق. ومفتاح الأدمن بيعدّي فوقها،
-- فـ`p_tenant` إجباري.
-- ==========================================================================

create or replace function public.profit_headline(
  p_tenant uuid,
  p_from   date,
  p_to     date
)
returns table (
  sales                numeric,
  gross_sales          numeric,
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
      coalesce(o.order_status, '') as st,
      (o.order_date   at time zone 'Africa/Cairo')::date as day,
      (o.delivered_at at time zone 'Africa/Cairo')::date as delivered_day,
      coalesce(o.discount, 0)       as discount,
      coalesce(o.shipping_price, 0) as ship,
      case when coalesce(o.bosta_fees_real, 0) > 0
           then o.bosta_fees_real
           else coalesce(o.bosta_shipping_cost, 0) end as carrier,
      coalesce(o.bosta_cod, 0) as bosta_cod,
      o.refunded_amount,
      o.refunded_at
    from orders o
    where o.tenant_id = p_tenant
      and (
        (o.order_date   at time zone 'Africa/Cairo')::date between p_from and p_to
        or (o.delivered_at at time zone 'Africa/Cairo')::date between p_from and p_to
      )
  ),
  items as (
    select
      oi.order_id,
      sum(oi.quantity * oi.sale_price_at_order) as goods,
      -- المستحق للعميل: الراجع × سعره (`refundDue`)
      sum(coalesce(oi.returned_quantity, 0) * oi.sale_price_at_order) as due,
      sum(oi.quantity * coalesce(oi.cost_price_at_order, 0)) as cost_all,
      -- التكلفة من غير اللي رجع الرف — التالف بيفضل (`itemCost`)
      sum(
        (oi.quantity - case
           when oi.returned_condition = 'damaged' then 0
           else least(coalesce(oi.returned_quantity, 0), oi.quantity)
         end) * coalesce(oi.cost_price_at_order, 0)
      ) as cost_kept
    from order_items oi
    join base b on b.id = oi.order_id
    group by oi.order_id
  ),
  m as (
    select
      b.*,
      coalesce(i.goods, 0) as goods,
      case when b.st = 'returned_after_delivery'
           then coalesce(i.cost_kept, 0)
           else coalesce(i.cost_all, 0) end as cost,
      -- الريفند (`orderRefund`): المتأكّد، وإلا المستحق
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
  carrier as (
    -- AT_CARRIER_STATUSES
    select * from in_period
    where st in ('shipped', 'out_for_delivery', 'delivered', 'awaiting_action',
                 'returning', 'returned', 'returned_after_delivery')
      and carrier > 0
  ),
  money as (
    select
      (select coalesce(sum(goods - discount + ship - refund), 0) from counted) as sales,
      (select coalesce(sum(goods - discount + ship), 0) from in_period)       as gross_sales,
      (select coalesce(sum(goods - cost - refund - discount), 0) from counted) as profit,
      (select count(*) from counted)                                         as order_count,
      (select coalesce(sum(carrier), 0) from carrier)                         as bosta_total,
      (select count(*) from carrier where st <> 'returned')                   as shipped_count,
      (select coalesce(sum(ship), 0) from carrier where st <> 'returned')     as shipping_revenue,
      (select coalesce(sum(case when bosta_cod > 0 then bosta_cod else goods - discount end), 0)
         from m
        where st = 'delivered' and delivered_day between p_from and p_to)     as cod
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
    money.profit,
    spent.counted,
    spent.excluded,
    money.shipping_revenue,
    money.shipped_count,
    money.bosta_total,
    money.bosta_total - money.shipping_revenue,
    money.profit - spent.counted - (money.bosta_total - money.shipping_revenue),
    money.cod,
    money.order_count
  from money, spent;
$$;

revoke all on function public.profit_headline(uuid, date, date) from public, anon;
grant execute on function public.profit_headline(uuid, date, date) to authenticated, service_role;


-- ===== تأكيد: أرقام كل بيزنس من الدالة =====
-- كل الوقت وآخر ٣٠ يوم. المقارنة بالكود بتتعمل بعد التشغيل.
select
  t.name,
  round(a.sales)      as "مبيعات كل الوقت",
  round(a.net_profit) as "صافي كل الوقت",
  round(r.sales)      as "مبيعات آخر ٣٠ يوم",
  round(r.net_profit) as "صافي آخر ٣٠ يوم"
from tenants t
cross join lateral public.profit_headline(t.id, date '2000-01-01', (now() at time zone 'Africa/Cairo')::date) a
cross join lateral public.profit_headline(t.id, (now() at time zone 'Africa/Cairo')::date - 29, (now() at time zone 'Africa/Cairo')::date) r
order by t.name;

-- ==========================================================================
-- استثناء أوردر من طابور «مرتجع محتاج تسجيل» — بعلامة على الأوردر نفسه
-- --------------------------------------------------------------------------
-- الطابور بيعدّ كل «مرتجع بعد التسليم» اللي مالوش كميات راجعة متسجّلة.
-- مينيز فيها ٨ من فبراير ليونيو، وعمر قرر يسيبهم (١٧ سبتمبر). من غير
-- استثناء كانوا هيفضلوا ٨ للأبد، والرقم كان هيتعلّم إنه يتتجاهل.
--
-- ⚠️ **العلامة بسببها على الأوردر مش تاريخ في الكود** — السبب بيبان لما
-- الأوردر يتفتح، والعلامة بتتشال من صفحته فيرجع للطابور.
--
-- الملف بيضيف عمود ويعلّم التمانية بأرقامهم بالظبط، وبس لو لسه مالهمش
-- كميات راجعة. مابيمسحش حاجة.
-- ==========================================================================

alter table orders
  add column if not exists return_skip_reason text;

comment on column orders.return_skip_reason is
  'ليه الأوردر مستثنى من طابور «مرتجع محتاج تسجيل» — فاضي = مش مستثنى';

update orders o
set return_skip_reason = 'مرتجع قديم قبل تسجيل المرتجع على الأوردر — عمر قرر يتساب'
where o.tenant_id = '00000000-0000-0000-0000-000000000001'
  and o.order_status = 'returned_after_delivery'
  and o.order_number in ('1081', '1141', '1193', '1227', '1238', '1250', '1256', '1302')
  and o.return_skip_reason is null
  and not exists (
    select 1 from order_items i
    where i.order_id = o.id and coalesce(i.returned_quantity, 0) > 0
  );


-- ===== تأكيد: المفروض ٨ صفوف، كلهم مينيز =====
select t.name, o.order_number, o.return_skip_reason
from orders o
join tenants t on t.id = o.tenant_id
where o.return_skip_reason is not null
order by t.name, o.order_number;

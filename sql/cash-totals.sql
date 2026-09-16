-- ==========================================================================
-- رصيد الخزنة بيتحسب في الداتابيز — مش في الصفحة
-- --------------------------------------------------------------------------
-- ⚠️⚠️ **الصفحة كانت بتجيب كل الحركات وتجمعها بنفسها، وسوبابيز بيرجّع
-- ١٠٠٠ صف بالكتير.** عند الحركة رقم ١٠٠١ الرصيد كان هيطلع غلط من غير أي
-- رسالة — ومينيز فيها ٨٤ حركة دلوقتي، يعني الباج كان مستني.
--
-- الدالة بتجمع كل الحركات في الداتابيز نفسها وبترجّع ٥ أرقام بس.
--
-- ⚠️ **security invoker** — بتشتغل بصلاحيات اللي بيناديها، فقاعدة العزل
-- (tenant_isolation) بتتطبق عليها زي أي قراية. مفتاح الأدمن بيعدّي فوق
-- القواعد، فعشان كده `p_tenant` إجباري ومالوش قيمة افتراضية.
--
-- ⚠️ لحد ما الملف ده يتشغّل، الكود بيجمع الحركات صفحة صفحة (كل صفحة ١٠٠٠)
-- لحد ما تخلص — أبطأ بس مابيقصّش. (`lib/cash-totals.ts`)
-- ==========================================================================

create or replace function public.cash_totals(p_tenant uuid)
returns table (
  total_in  numeric,
  total_out numeric,
  count_all bigint,
  count_in  bigint,
  count_out bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where direction = 'in'), 0),
    coalesce(sum(amount) filter (where direction = 'out'), 0),
    count(*),
    count(*) filter (where direction = 'in'),
    count(*) filter (where direction = 'out')
  from cash_transactions
  where tenant_id = p_tenant;
$$;

revoke all on function public.cash_totals(uuid) from public, anon;
grant execute on function public.cash_totals(uuid) to authenticated, service_role;


-- ===== تأكيد: الرقمين لازم يطابقوا =====
-- الأول من الدالة، والتاني جمع مباشر. أي فرق = وقف.
select
  t.name,
  (select total_in - total_out from public.cash_totals(t.id)) as "من الدالة",
  (select coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
     from cash_transactions c where c.tenant_id = t.id)       as "جمع مباشر"
from tenants t
order by t.name;

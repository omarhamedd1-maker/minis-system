-- ==========================================================================
-- الرصيد الافتتاحي — صف لوحده، واحد لكل بيزنس (MONEY §٦.٤)
-- --------------------------------------------------------------------------
-- قبل كده كان بيتسجّل حركة «إيداع» يدوية مكتوب عليها «رصيد افتتاحي»،
-- فبيبان حركة زي أي تحصيل، وبيتعدّل أو يتلغي كأنه حركة عادية.
--
-- الملف بيعمل حاجتين:
--   ١. **بيحوّل** الحركة دي لنوع `opening` — بشروط كلها لازم تتحقق:
--      إيداع يدوي · الوصف «رصيد افتتاحي» بالظبط · **أقدم حركة في البيزنس
--      بيوم على الأقل** · مااتلغتش · والبيزنس مالوش رصيد افتتاحي. المبلغ
--      والتاريخ مابيتغيّروش، فالرصيد مابيتغيّرش.
--   ٢. **بيمنع** أكتر من رصيد افتتاحي للبيزنس.
--
-- ⚠️ المتوقع: مينيز (٢٣,٢٥٠ · ١٨ يوليو) والتجريبي (٢٥,٠٠٠ · ١٣ يناير).
-- 2 SEC أول حركة عندها مش رصيد افتتاحي — مابيتلمسش.
-- ==========================================================================

update cash_transactions c
set source_type = 'opening'
where c.source_type = 'manual'
  and c.direction = 'in'
  and btrim(coalesce(c.description, '')) = 'رصيد افتتاحي'
  and not exists (
    select 1 from cash_transactions o
    where o.tenant_id = c.tenant_id
      and o.id <> c.id
      and o.transaction_date::date <= c.transaction_date::date
  )
  and not exists (
    select 1 from cash_transactions r where r.reversal_of = c.id
  )
  and not exists (
    select 1 from cash_transactions x
    where x.tenant_id = c.tenant_id and x.source_type = 'opening'
  );

create unique index if not exists cash_transactions_one_opening
  on cash_transactions (tenant_id)
  where source_type = 'opening';


-- ===== تأكيد: الرصيد الافتتاحي لكل بيزنس، والرصيد من غير تغيير =====
select
  t.name,
  o.amount                  as "الرصيد الافتتاحي",
  o.transaction_date::date  as "تاريخه",
  (select total_in - total_out from public.cash_totals(t.id)) as "الرصيد الحالي"
from tenants t
left join cash_transactions o
  on o.tenant_id = t.id and o.source_type = 'opening'
order by t.name;

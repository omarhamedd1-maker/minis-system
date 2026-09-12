-- ==========================================================================
-- الفلوس المقدمة تتسجّل مرة واحدة لكل أوردر — قيد في الداتابيز
-- --------------------------------------------------------------------------
-- ⚠️⚠️ **ده اتكتب بعد ما الخزنة زوّدت ١٨٨٬٥٢٩ جنيه من العدم.**
--
-- بين ٩ و١٢ سبتمبر ٢٠٢٦ اتسجّلت **٦٠ حركة مقدم على ٥ أوردرات بس** عند
-- مينيز — دفعات من ٥ في لفّات كرون متفرقة. السبب: الكود بيقرا حركات
-- الخزنة عشان يعرف إيه اللي متسجّل، **وكان بيتجاهل خطأ القراية**. لما
-- القراية بتفشل، السيستم بيشوف إن مافيش حاجة متسجّلة ويكتب كل حاجة من
-- أول وجديد.
--
-- الكود اتصلّح (`lib/prepaid-cash-run.ts` بيقف لو القراية فشلت)، بس
-- **الكود ممكن يغلط تاني والقيد مش بيغلط**. ده الضمان التاني.
--
-- ⚠️ **على `related_order_id` لما المصدر `prepaid` بس** — الحركات اليدوية
-- وحركات المصاريف ممكن يبقى فيها أكتر من واحدة على نفس الأوردر بشكل سليم.
-- ==========================================================================


-- ===== خطوة ١: شوف التكرار قبل ما تمسح =====
--
-- ⚠️ **اقرا الناتج ده الأول.** المفروض تشوف الأوردرات المتكررة وعدد
-- النسخ الزيادة والمبلغ. لو الأرقام مش منطقية، وقف واسأل.

select
  o.order_number                as "الأوردر",
  count(*)                      as "عدد الحركات",
  max(c.amount)                 as "المبلغ",
  (count(*) - 1) * max(c.amount) as "الزيادة الوهمية"
from cash_transactions c
join orders o on o.id = c.related_order_id
where c.source_type = 'prepaid'
group by o.order_number
having count(*) > 1
order by (count(*) - 1) * max(c.amount) desc;


-- ===== خطوة ٢: امسح الزيادة، وسيب الأقدم =====
--
-- ⚠️⚠️ **بيسيب أقدم صف لكل أوردر** — ده الأصلي اللي اتسجّل صح، والباقي
-- نسخ من العطل. مافيش مبلغ بيتغيّر، ومافيش حركة يدوية بتتلمس.

delete from cash_transactions c
using (
  select
    id,
    row_number() over (
      partition by tenant_id, related_order_id
      order by created_at asc
    ) as n
  from cash_transactions
  where source_type = 'prepaid'
    and related_order_id is not null
) dup
where c.id = dup.id
  and dup.n > 1;


-- ===== خطوة ٣: القيد اللي بيمنع التكرار للأبد =====

create unique index if not exists cash_prepaid_once
  on cash_transactions (tenant_id, related_order_id)
  where source_type = 'prepaid' and related_order_id is not null;


-- ===== التأكيد: المفروض مفيش ولا صف =====

select
  o.order_number as "لسه متكرر",
  count(*)       as "عدد"
from cash_transactions c
join orders o on o.id = c.related_order_id
where c.source_type = 'prepaid'
group by o.order_number
having count(*) > 1;


-- ===== والرصيد بعد التنضيف =====

select
  t.name                                                          as "البيزنس",
  sum(case when c.direction = 'in'  then c.amount else 0 end)     as "داخل",
  sum(case when c.direction = 'out' then c.amount else 0 end)     as "خارج",
  sum(case when c.direction = 'in'  then c.amount else -c.amount end) as "الرصيد"
from cash_transactions c
join tenants t on t.id = c.tenant_id
group by t.name
order by t.name;


-- ===== وللتراجع عن القيد =====
--   drop index if exists cash_prepaid_once;

-- ==========================================================================
-- مصدر مبلغ التحصيل + رجوع الـ٢٣ أوردر (DESIGN قاعدة ١٠ · NEXT §٣٦)
-- --------------------------------------------------------------------------
-- ⚠️⚠️ **الرقم اللي مالوش مصدر بيتحسب صفر في الجمع من غير أي علامة.** ده
-- حصل تلات مرات (NEXT §٢٩)، وآخرها ٥٥ أوردر متسلّم في مينيز من غير
-- `bosta_cod` كسروا ربط التحويلات بالأوردرات.
--
-- العمود ده بيقول الرقم جه منين:
--   'bosta'   من رد بوسطة (المزامنة)
--   'sent'    الرقم اللي إحنا بعتناه لبوسطة وقت عمل الشحنة (`bosta_cod_sent`)
--   'unknown' مش معروف — **ومايتحسبش صفر**، يتشال من الحسابات ويبان في الشاشة
--
-- والملف بيعمل تلات حاجات:
--   ١. العمود + قيمته للموجود دلوقتي.
--   ٢. **رجوع الـ٢٣** أوردر اللي بوسطة صفّرت تحصيلها بعد التسوية، من
--      `bosta_cod_sent` — ده رقمنا إحنا مش تخمين.
--   ٣. اللي لا ده ولا ده يتعلّم `unknown`.
--
-- ⚠️ **بوسطة بتصفّر التحصيل بعد التسوية**، والحارس في `lib/bosta/reconcile.ts`
-- (١٧ أغسطس) بيمنع الصفر ده إنه يمسح رقم موجود — فالرجوع ده **مايتصفّرش تاني**.
-- ==========================================================================

alter table orders
  add column if not exists cod_source text;

comment on column orders.cod_source is
  'مصدر bosta_cod: bosta = رد بوسطة · sent = اللي بعتناه · unknown = مش معروف';

-- ١) الموجود وقيمته أكبر من صفر = من بوسطة
update orders
set cod_source = 'bosta'
where cod_source is null
  and coalesce(bosta_cod, 0) > 0;

-- ٢) المتسلّم اللي تحصيله صفر وعندنا الرقم اللي بعتناه → يرجع
update orders
set bosta_cod = bosta_cod_sent,
    cod_source = 'sent'
where order_status = 'delivered'
  and coalesce(bosta_cod, 0) = 0
  and coalesce(bosta_cod_sent, 0) > 0;

-- ٣) الباقي: تحصيله مش معروف — ومايتحسبش صفر
update orders
set cod_source = 'unknown'
where cod_source is null
  and order_status = 'delivered'
  and coalesce(bosta_cod, 0) = 0;


-- ===== تأكيد =====
-- المتوقع: مينيز ٢٣ صف بقت 'sent'، والباقي 'bosta' أو 'unknown'
select
  t.name,
  count(*) filter (where o.cod_source = 'bosta')   as "من بوسطة",
  count(*) filter (where o.cod_source = 'sent')    as "من اللي بعتناه",
  count(*) filter (where o.cod_source = 'unknown') as "مش معروف",
  round(coalesce(sum(o.bosta_cod) filter (where o.cod_source = 'sent'), 0)) as "اللي رجع"
from orders o
join tenants t on t.id = o.tenant_id
where o.order_status = 'delivered' and o.archived = false
group by t.name
order by t.name;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- ⚠️ الرجوع بيصفّر اللي رجع — والصفر ده هو الغلط اللي كنا بنصلّحه
-- update orders set bosta_cod = 0 where cod_source = 'sent';
-- alter table orders drop column if exists cod_source;

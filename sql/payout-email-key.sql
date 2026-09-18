-- ==========================================================================
-- العنوان السري لاستقبال إيميل التحويل (TRANSFERS §٣ · §٤ طبقة ١)
-- --------------------------------------------------------------------------
-- ⚠️⚠️ **مش Gmail API — والسبب تجاري.** الحل إن السيستم يتوصّل بجيميل
-- ويقرا كل الإيميلات معناه إن كل مشتري يدّي صلاحية قراية صندوقه كله عشان
-- ٥ إيميلات في الأسبوع. بدلها: **عنوان سري لكل بيزنس**، والمشتري بيعمل
-- قاعدة تحويل واحدة في جيميل.
--
-- المفتاح ده **سر**: أي حد يعرفه يقدر يبعت إيميل يعمل تحويل. فبيتولّد
-- عشوائي، وبيتغيّر لو اتسرّب (نفس فكرة `bosta_webhook_token`).
--
-- ⚠️ ومعرفة المفتاح **مش كفاية لوحدها**: الإيميل لازم يعدّي باقي الطبقات
-- (توقيع بوسطة · المطابقة بالمبلغ · رقم فاتورة مايتكررش) قبل أي تسجيل.
-- ==========================================================================

alter table tenant_credentials
  add column if not exists payout_email_key text;

comment on column tenant_credentials.payout_email_key is
  'المفتاح السري في عنوان استقبال إيميل التحويل — transfers+<key>@…';

-- مفتاح لكل بيزنس مالوش واحد
update tenant_credentials
set payout_email_key = encode(gen_random_bytes(16), 'hex')
where payout_email_key is null;

create unique index if not exists tenant_credentials_payout_key
  on tenant_credentials (payout_email_key);


-- ===== تأكيد =====
-- المفتاح نفسه مابيتعرضش هنا — بيبان في شاشة الإعدادات لصاحب البيزنس
select
  t.name,
  case when c.payout_email_key is null then '— مفيش' else 'اتعمل' end as "المفتاح",
  length(c.payout_email_key) as "طوله"
from tenants t
left join tenant_credentials c on c.tenant_id = t.id
order by t.name;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop index if exists tenant_credentials_payout_key;
-- alter table tenant_credentials drop column if exists payout_email_key;

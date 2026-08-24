-- ==========================================================================
-- سجل التنبيهات — عشان التنبيه «مرة في اليوم» يبقى فعلًا مرة في اليوم
-- --------------------------------------------------------------------------
-- ⚠️⚠️ **`tag` في الويب بوش مابيمنعش الإرسال.** هو بيخلّي **الجهاز**
-- يستبدل الإشعار القديم بالجديد على الشاشة — الرسالة بتتبعت برضه والتليفون
-- بيرن برضه.
--
-- يعني أي تنبيه مربوط بتاج كان بيتبعت **كل ربع ساعة طول اليوم — ٩٦ مرة**.
-- ده حصل فعلًا يوم ٢٠ أغسطس ٢٠٢٦: تنبيه المبيعات الواقعة فضل يرن من الفجر.
--
-- الجدول ده هو المنع الحقيقي: **القيد الفريد** على (البيزنس + التاج). أول
-- واحد بيكتب بيبعت، والباقي بيترفض بكود 23505 ويتخطّى.
--
-- ⚠️ **مقفول تمامًا** (RLS من غير أي قاعدة) — مفتاح الأدمن بس بيكتب فيه،
-- زي `activity_log` و`sync_runs`.
-- ==========================================================================

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  -- زي `drop-2026-08-20` أو `season-eid-fitr-2027-30`
  tag text not null,
  created_at timestamptz not null default now()
);

alter table notification_log enable row level security;

-- ⚠️ **ده بيت القصيد** — من غير القيد ده الجدول مالوش لازمة
create unique index if not exists notification_log_once
  on notification_log (tenant_id, tag);

create index if not exists notification_log_recent
  on notification_log (tenant_id, created_at desc);


-- ===== تنضيف: الأقدم من شهرين مالوش لازمة =====
-- (التاج فيه التاريخ، فالقديم عمره ما هيتكرر)
--
--   delete from notification_log where created_at < now() - interval '60 days';


-- ===== التأكيد =====
select count(*) as "صفوف" from notification_log;


-- ===== وللتراجع =====
--   drop table if exists notification_log;

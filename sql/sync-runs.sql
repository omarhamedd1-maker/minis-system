-- ==========================================================================
-- سجل تشغيل المزامنة — عشان نعرف لو وقفت
-- ==========================================================================
-- المشكلة: المزامنة بتشتغل كل ١٥ دقيقة من قاعدة البيانات نفسها، ومفيش أي
-- أثر لتشغيلها. لو الجدولة وقفت أو المفتاح باظ أو بوسطة رفضت، الحالات
-- بتتجمّد والأرقام بتقدم — **ومحدش هيعرف غير بالصدفة**.
--
-- ده حصل النهاردة أكتر من مرة: تحديث التحصيل كان بيفشل في الخفا، والبوليصة
-- كانت مكسورة، ومحدش خد باله.
--
-- الجدول مقفول (RLS من غير أي قاعدة) — مفتاح الأدمن بس بيكتب ويقرا فيه،
-- زي activity_log بالظبط.
-- ==========================================================================

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  -- 'bosta' دلوقتي، ولما شوبيفاي تنتقل هتبقى 'shopify' كمان
  source text not null default 'bosta',
  ok boolean not null,
  -- عرض بس؟ التجربة مابتغيّرش حاجة فمابتتحسبش تشغيل حقيقي
  dry boolean not null default false,
  fetched int,
  matched int,
  changed int,
  unmatched int,
  errors text,
  duration_ms int,
  created_at timestamptz not null default now()
);

alter table sync_runs enable row level security;

-- بندوّر كتير على "آخر تشغيل ناجح"
create index if not exists sync_runs_recent
  on sync_runs (tenant_id, created_at desc);


-- ===== تأكيد =====
--   select created_at, ok, dry, fetched, matched, changed, errors
--   from sync_runs order by created_at desc limit 10;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop table if exists sync_runs;

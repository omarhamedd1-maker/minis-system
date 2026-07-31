-- ==========================================================================
-- سجل الاستيراد — عشان يبقى فيه رجوع
-- ==========================================================================
-- المشكلة: الجلب من شوبيفاي بيعمل أوردرات وعملاء ومنتجات دفعة واحدة. لو
-- طلعوا غلط، الرجوع بيبقى شغل يدوي في قاعدة البيانات — وده بالظبط اللي
-- المفروض العميل الجديد مايعملهوش.
--
-- كل عملية استيراد بتتسجّل هنا **ومعاها اللي عملته بالظبط** في `payload`،
-- فالتراجع بيبقى ضغطة زرار: نمسح اللي اتعمل، ونرجّع اللي اتغيّر.
--
-- شكل `payload` (كل خانة اختيارية حسب نوع العملية):
--   { "products":  ["uuid"],                       المنتجات اللي اتعملت
--     "variants":  ["uuid"],                       الأشكال اللي اتعملت
--     "orders":    ["uuid"],                       الأوردرات اللي اتعملت
--     "customers": ["uuid"],                       العملاء اللي اتعملوا
--     "trackings": [{"orderId":"uuid"}],           شحنات اتربطت (الرجوع = تفريغ)
--     "costs":     [{"variantId":"uuid","previous":0}] تكاليف اتغيّرت
--   }
--
-- الجدول مقفول (RLS من غير أي قاعدة) — مفتاح الأدمن بس بيكتب ويقرا فيه،
-- زي `activity_log` و`sync_runs` بالظبط.
-- ==========================================================================

create table if not exists import_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  -- 'products' | 'orders' | 'shipments' | 'costs'
  kind text not null,
  -- جملة بالعربي بتتعرض في الشاشة زي "٨٠ أوردر و٥ عملاء"
  summary text not null,
  actor_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- اتعمله تراجع؟ بنسيب الصف كتاريخ بدل ما نمسحه
  undone_at timestamptz,
  undone_by text
);

alter table import_runs enable row level security;

-- الشاشة بتعرض آخر العمليات
create index if not exists import_runs_recent
  on import_runs (tenant_id, created_at desc);


-- ===== تأكيد =====
--   select created_at, kind, summary, undone_at
--   from import_runs order by created_at desc limit 10;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop table if exists import_runs;

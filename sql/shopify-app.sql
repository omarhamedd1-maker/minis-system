-- ==========================================================================
-- تطبيق شوبيفاي — الربط بضغطة واحدة
-- ==========================================================================
-- الفكرة: تطبيق واحد للمنصة كلها (بيتسجّل مرة واحدة في Shopify Partners)،
-- وكل بيزنس بيربط متجره بضغطة عن طريق OAuth — من غير ما حد يلزق مفاتيح.
--
--   shopify_app          بيانات التطبيق. صف واحد للمنصة كلها.
--   shopify_installs     حالة الربط لكل بيزنس (الـstate بيمنع التلاعب).
--
-- والتوكن بتاع كل متجر بيتحفظ في `tenant_credentials.shopify_access_token`
-- زي ما هو موجود.
--
-- الاتنين مقفولين (RLS من غير أي قاعدة) — مفتاح الأدمن بس.
-- ==========================================================================

create table if not exists shopify_app (
  id smallint primary key default 1,
  client_id text not null,
  client_secret text not null,
  updated_at timestamptz not null default now(),
  constraint shopify_app_single_row check (id = 1)
);

alter table shopify_app enable row level security;

-- الـstate: رقم عشوائي بنبعته لشوبيفاي وبنستناه يرجع زي ما هو. من غيره
-- أي حد يقدر يزوّر رجوع الربط ويربط متجره ببيزنس تاني.
create table if not exists shopify_installs (
  state text primary key,
  tenant_id uuid not null,
  shop text,
  started_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table shopify_installs enable row level security;

create index if not exists shopify_installs_tenant
  on shopify_installs (tenant_id, created_at desc);


-- ===== تأكيد =====
--   select client_id is not null as التطبيق_مظبوط from shopify_app;
--   select tenant_id, shop, completed_at from shopify_installs
--   order by created_at desc limit 10;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop table if exists shopify_installs;
-- drop table if exists shopify_app;

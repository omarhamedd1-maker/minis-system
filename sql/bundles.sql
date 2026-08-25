-- ==========================================================================
-- الباقات والأطقم — كذا منتج بسعر واحد
-- --------------------------------------------------------------------------
-- الباقة بتبيع أكتر: العميل بياخد ٣ حاجات بسعر أحسن، وإنت بتشحن شحنة واحدة
-- بدل تلاتة.
--
-- ⚠️⚠️ **الباقة مش منتج.** لو اتسجّلت كمنتج واحد، المخزون مابينقصش من
-- الأشكال اللي جوّاها، والربح بيتحسب على تكلفة وهمية. عشان كده الباقة هنا
-- **وصفة**: بنودها أشكال حقيقية، ولما تتباع بتتحوّل لبنود أوردر عادية
-- بسعر موزّع — فالمخزون والأرباح ونسب الرجوع كلها بتفضل صح لوحدها.
--
-- ⚠️ **والسعر بيتوزّع بنسبة سعر كل بند** (`lib/bundle.ts`) — مش كل بند
-- بسعره وخصم منفصل. من غير كده ربح كل منتج بيبان أعلى من الحقيقة.
--
-- ⚠️ **والباقة بتتقفل مش بتتمسح** (`active`) — الأوردرات القديمة بتشاور
-- عليها، ومسحها بيخلّي تاريخ البيع يشاور على حاجة مش موجودة.
-- ==========================================================================

create table if not exists bundles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  -- سعر الباقة كلها — والتوزيع على البنود بيحصل وقت البيع
  price numeric not null check (price > 0),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists bundles_tenant_idx
  on bundles (tenant_id, active, created_at desc);

alter table bundles enable row level security;


create table if not exists bundle_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  bundle_id uuid not null references bundles(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists bundle_items_bundle_idx
  on bundle_items (bundle_id);

-- ⚠️ **نفس الشكل مرتين في نفس الباقة غلط** — الكمية هي اللي بتزوّد، والصف
-- المكرر بيخلّي التوزيع يحسبه مرتين بأوزان مختلفة.
create unique index if not exists bundle_items_once
  on bundle_items (bundle_id, variant_id);

alter table bundle_items enable row level security;


-- ===== التأكيد =====
select
  (select count(*) from bundles) as "باقات",
  (select count(*) from bundle_items) as "بنود";


-- ===== وللتراجع =====
--   drop table if exists bundle_items;
--   drop table if exists bundles;

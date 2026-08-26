-- ==========================================================================
-- التقييم بعد التسليم
-- --------------------------------------------------------------------------
-- رسالة «وصلك؟» بتتبعت خلاص بعد التسليم، والعميل بيرد بكلام في واتساب —
-- كلام مابيتسجّلش في أي مكان. فاللي بيشتكي وده بيتكرر على نفس المنتج،
-- محدش بيربط.
--
-- ⚠️⚠️ **التقييم بيتربط بالمنتج مش بالأوردر بس.** «العميل مبسوط» رقم
-- مالوش فايدة؛ «الشكل ده متوسطه ٢٫١ من ١٤ تقييم» رقم بيتعمل عليه حاجة.
-- والربط بيحصل وقت القراية من بنود الأوردر — مافيش نسخ للأشكال هنا.
--
-- ⚠️ **مرة واحدة لكل أوردر** (قيد فريد) — لو العميل قدر يقيّم عشر مرات،
-- أول واحد زعلان بيقلب متوسط المنتج لوحده.
--
-- ⚠️⚠️ **والجدول مقفول** (RLS من غير أي قاعدة). الصفحة العامة بتكتب فيه
-- بمفتاح الأدمن **بمعرّف الأوردر** (`uuid` مالوش تخمين)، زي `order_links`
-- و`/track` بالظبط. مافيش كتابة من المتصفح خالص.
-- ==========================================================================

create table if not exists order_ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ⚠️ **ده بيت القصيد** — من غيره العميل بيقيّم نفس الأوردر كذا مرة
create unique index if not exists order_ratings_once
  on order_ratings (order_id);

create index if not exists order_ratings_tenant_idx
  on order_ratings (tenant_id, created_at desc);

alter table order_ratings enable row level security;


-- ===== التأكيد =====
select count(*) as "تقييمات" from order_ratings;


-- ===== وللتراجع =====
--   drop table if exists order_ratings;

-- ==========================================================================
-- شيل جدول الإعدادات — الأرقام اللي كانت فيه مالهاش لزمة
-- ==========================================================================
-- عمر قرر (وهو محق):
--
--   • الشحن اللي العميل بيدفعه  ← بيتقرا من كل أوردر زي ما نزل من شوبيفاي.
--     مفيش رقم ثابت يتظبط، والحسبة بتفضل صح حتى لو الشحن اختلف من أوردر
--     للتاني أو من عميل للتاني.
--
--   • رسوم بوسطة  ← واحدة لكل العملاء، فبتفضل في الكود ومتغطية باختبارات.
--     مالهاش لازمة تتكرر في قاعدة البيانات لكل بيزنس.
--
--   • أنواع المصاريف  ← بتتكتب وقت تسجيل المصروف، والقايمة بتتكوّن من
--     اللي اتستخدم فعلاً. مفيش قايمة يظبطها حد قبل ما يبدأ.
--
-- اللي فضل لكل بيزنس هو مفاتيح الربط بس — وجدولها (tenant_credentials) باقي.
-- ==========================================================================

-- الترجر بقى بيعمل صف المفاتيح بس
create or replace function create_tenant_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tenant_credentials (tenant_id) values (new.id)
    on conflict (tenant_id) do nothing;
  return new;
end $$;

drop table if exists tenant_settings;


-- ===== تأكيد =====
--   select tablename from pg_tables
--   where schemaname = 'public' and tablename like 'tenant%';
-- المفروض tenants و tenant_credentials بس

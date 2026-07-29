-- ==========================================================================
-- العزل — الخطوة الخامسة: الإعدادات والمفاتيح لكل بيزنس
-- ==========================================================================
-- دلوقتي أرقام زي "الشحن 90" و"الباقة بتغطي 88" ورسوم بوسطة كلها مكتوبة
-- في الكود. تمام لبيزنس واحد، بس كل عميل جديد أرقامه مختلفة — وماينفعش
-- ننشر نسخة جديدة من السيستم كل ما عميل يغيّر سعر شحنه.
--
-- ومفتاح بوسطة دلوقتي واحد للسيستم كله، فأي عميل تاني هيبعت شحناته من
-- حساب مينيس. ده الباب المقفول قدام العميل التاني.
-- ==========================================================================

-- ===== ١) إعدادات كل بيزنس =====
create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,

  -- الشحن اللي العميل بيدفعه في كل أوردر
  shipping_charge numeric not null default 90,

  -- الشحن الأساسي اللي باقة شركة الشحن بتغطيه
  bundle_covers numeric not null default 88,
  bundle_price numeric not null default 2000,
  bundle_shipments integer not null default 20,

  -- أنواع المصاريف اللي بتظهر في القوايم
  expense_categories text[] not null default array[
    'بضاعة', 'إعلانات', 'شحن', 'تغليف', 'تصنيع وخامات',
    'مواصلات', 'اشتراكات', 'مرتجعات', 'أخرى'
  ],

  -- ===== رسوم شركة الشحن =====
  -- لما بوسطة تغيّر أسعارها، بتتعدّل من هنا — من غير نشر نسخة جديدة،
  -- ومن غير ما تتأثر باقي البيزنسات.
  fee_open numeric not null default 7,
  fee_cod_rate numeric not null default 0.01,
  fee_cod_threshold numeric not null default 2000,
  fee_transfer_rate numeric not null default 0.01,
  fee_transfer_min numeric not null default 13,
  fee_insurance_rate numeric not null default 0.01,
  fee_insurance_min numeric not null default 10,
  fee_insurance_max numeric not null default 20,
  fee_vat numeric not null default 1.14,

  updated_at timestamptz not null default now()
);

alter table tenant_settings enable row level security;

-- كل بيزنس يقرا إعداداته بس. التعديل بيتم من السيرفر بمفتاح الأدمن.
drop policy if exists tenant_settings_read on tenant_settings;
create policy tenant_settings_read on tenant_settings
  for select to authenticated
  using (tenant_id = current_tenant_id());


-- ===== ٢) مفاتيح كل بيزنس =====
-- الجدول ده **مالوش أي قاعدة** — يعني مقفول تمامًا قدام أي حد داخل من
-- المتصفح. مفتاح الأدمن بس هو اللي بيقراه، من كود السيرفر.
--
-- ملحوظة للمستقبل: سوبابيز فيه Vault للتشفير على مستوى الصف. الطريقة دي
-- كافية دلوقتي (نفس مستوى حماية باقي الجداول المقفولة)، بس Vault هو
-- التحسين الصح قبل ما نشيل مفاتيح عملاء كتير.
create table if not exists tenant_credentials (
  tenant_id uuid primary key references tenants(id) on delete cascade,

  bosta_api_key text,
  bosta_pickup_address_id text,

  shopify_shop text,
  shopify_access_token text,
  shopify_webhook_secret text,

  updated_at timestamptz not null default now()
);

alter table tenant_credentials enable row level security;
-- مفيش قواعد بقصد: مفتاح الأدمن بس


-- ===== ٣) بيزنس مينيس ياخد إعداداته الحالية =====
insert into tenant_settings (tenant_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (tenant_id) do nothing;

insert into tenant_credentials (tenant_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (tenant_id) do nothing;


-- ===== ٤) أي بيزنس جديد ياخد إعدادات افتراضية لوحده =====
create or replace function create_tenant_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tenant_settings (tenant_id) values (new.id)
    on conflict (tenant_id) do nothing;
  insert into tenant_credentials (tenant_id) values (new.id)
    on conflict (tenant_id) do nothing;
  return new;
end $$;

drop trigger if exists tenants_defaults on tenants;
create trigger tenants_defaults
  after insert on tenants
  for each row execute function create_tenant_defaults();


-- ===== ٥) تأكيد =====
--   select * from tenant_settings;
--   select tenant_id, bosta_api_key is not null as "فيه مفتاح" from tenant_credentials;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop trigger if exists tenants_defaults on tenants;
-- drop function if exists create_tenant_defaults();
-- drop table if exists tenant_credentials;
-- drop table if exists tenant_settings;

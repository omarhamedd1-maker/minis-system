-- ==========================================================================
-- العزل — الخطوة الأولى: جدول البيزنسات وخانة "رقم البيزنس" على كل جدول
-- ==========================================================================
-- الخطوة دي **مابتغيّرش أي سلوك**. كل الداتا الموجودة بتتنسب لبيزنس مينيس،
-- وأي صف جديد بياخد نفس الرقم لوحده. السيستم بيفضل شغال زي ما هو بالظبط.
--
-- بنعملها دلوقتي وإحنا لسه بيزنس واحد عشان تبقى أسهل ما يمكن — لو أجّلناها
-- لما يبقى فيه عملاء، بتتحول لعملية صعبة.
--
-- الرجوع: في آخر الملف.
-- ==========================================================================

-- ===== ١) جدول البيزنسات =====
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- الاشتراك: بنقفل الحساب لو وقف الدفع
  active boolean not null default true,
  subscription_ends_at date,
  created_at timestamptz not null default now()
);

-- بيزنس مينيس نفسه — أول بيزنس في السيستم
insert into tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'مينيس')
on conflict (id) do nothing;


-- ===== ٢) خانة رقم البيزنس على كل جدول =====
-- القيمة الافتراضية = مينيس، عشان الداتا الموجودة والصفوف الجديدة تشتغل
-- من غير ما نلمس أي كود دلوقتي.

do $$
declare
  t text;
  minis constant uuid := '00000000-0000-0000-0000-000000000001';
  tables constant text[] := array[
    'orders', 'order_items', 'order_comments',
    'customers', 'products', 'product_variants', 'variant_cost_components',
    'stock_movements', 'expenses', 'cash_transactions',
    'app_users', 'roles', 'activity_log', 'deletion_requests',
    'suppliers', 'supplier_transactions', 'supplier_invoice_items',
    'bosta_cashouts', 'shipments'
  ];
begin
  foreach t in array tables loop
    -- الخانة نفسها بقيمة افتراضية
    execute format(
      'alter table %I add column if not exists tenant_id uuid not null default %L references tenants(id) on delete restrict',
      t, minis
    );
    -- فهرس عشان الفلترة بالبيزنس تبقى سريعة
    execute format(
      'create index if not exists %I on %I (tenant_id)',
      t || '_tenant_idx', t
    );
  end loop;
end $$;


-- ===== ٣) تأكيد =====
-- المفروض ترجّع 19 صف، كل واحد فيه tenant_id
--
--   select table_name from information_schema.columns
--   where column_name = 'tenant_id' and table_schema = 'public'
--   order by table_name;
--
-- والمفروض كل الداتا القديمة بقت منسوبة لمينيس:
--
--   select count(*) from orders where tenant_id = '00000000-0000-0000-0000-000000000001';


-- ==========================================================================
-- الرجوع (لو احتجت تلغي الخطوة دي)
-- ==========================================================================
-- do $$
-- declare t text;
--   tables constant text[] := array[
--     'orders','order_items','order_comments','customers','products',
--     'product_variants','variant_cost_components','stock_movements','expenses',
--     'cash_transactions','app_users','roles','activity_log','deletion_requests',
--     'suppliers','supplier_transactions','supplier_invoice_items',
--     'bosta_cashouts','shipments'];
-- begin
--   foreach t in array tables loop
--     execute format('alter table %I drop column if exists tenant_id', t);
--   end loop;
-- end $$;
-- drop table if exists tenants;

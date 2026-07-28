-- ==========================================================================
-- العزل — الخطوة التانية: قاعدة البيانات تملّي رقم البيزنس لوحدها
-- ==========================================================================
-- دلوقتي القيمة الافتراضية ثابتة على "مينيس". ده تمام وإحنا بيزنس واحد،
-- بس أول ما ييجي بيزنس تاني، أي صف جديد هيتنسبله مينيس غلط.
--
-- الحل: القيمة الافتراضية تبقى **بيزنس المستخدم اللي عامل العملية**.
-- كده مش محتاجين نعدّل مئات الأماكن في الكود اللي بتضيف صفوف — ولا واحد
-- منهم هينسى الخانة، لأن قاعدة البيانات هي اللي بتحطها.
--
-- الخطوة دي برضه **مابتغيّرش أي سلوك دلوقتي**: طول ما فيه بيزنس واحد،
-- النتيجة هي نفسها.
-- ==========================================================================

-- ===== ١) البيزنس بتاع المستخدم اللي داخل =====
-- بتقرا من app_users حسب المستخدم الحالي. لو مفيش مستخدم (السيستم شغال
-- بمفتاح الأدمن من دالة مجدولة مثلاً) بترجّع مينيس.
create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tenant_id from app_users where auth_user_id = auth.uid() limit 1),
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;

comment on function current_tenant_id() is
  'رقم البيزنس بتاع المستخدم اللي داخل — بتُستخدم كقيمة افتراضية وفي قواعد المنع';


-- ===== ٢) نخلّيها هي القيمة الافتراضية بدل الرقم الثابت =====
do $$
declare
  t text;
  tables constant text[] := array[
    'orders', 'order_items', 'order_comments',
    'customers', 'products', 'product_variants', 'variant_cost_components',
    'stock_movements', 'expenses', 'cash_transactions',
    'activity_log', 'deletion_requests',
    'suppliers', 'supplier_transactions', 'supplier_invoice_items',
    'bosta_cashouts', 'shipments'
  ];
begin
  foreach t in array tables loop
    execute format(
      'alter table %I alter column tenant_id set default current_tenant_id()',
      t
    );
  end loop;
end $$;

-- ملحوظة: app_users و roles مقصود إنهم فضلوا بالقيمة الثابتة.
-- عشان لما نعمل بيزنس جديد، بننشئ أول مستخدم ليه من لوحة الإدارة —
-- والمستخدم ده لسه مالوش بيزنس، فمينفعش نعتمد على الدالة.
-- بنحدد بيزنسه صراحةً وقت الإنشاء.


-- ===== ٣) تأكيد =====
--   select column_name, column_default
--   from information_schema.columns
--   where column_name = 'tenant_id' and table_schema = 'public';
--
-- المفروض تلاقي current_tenant_id() في 17 جدول،
-- والرقم الثابت في app_users و roles.


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- do $$
-- declare t text;
--   tables constant text[] := array[
--     'orders','order_items','order_comments','customers','products',
--     'product_variants','variant_cost_components','stock_movements','expenses',
--     'cash_transactions','activity_log','deletion_requests','suppliers',
--     'supplier_transactions','supplier_invoice_items','bosta_cashouts','shipments'];
-- begin
--   foreach t in array tables loop
--     execute format(
--       'alter table %I alter column tenant_id set default ''00000000-0000-0000-0000-000000000001''::uuid', t);
--   end loop;
-- end $$;
-- drop function if exists current_tenant_id();

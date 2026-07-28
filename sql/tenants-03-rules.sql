-- ==========================================================================
-- العزل — الخطوة التالتة: قواعد المنع (الحماية الحقيقية)
-- ==========================================================================
-- لحد دلوقتي كل صف عارف هو تبع مين، بس محدش بيمنع حد من إنه يشوف داتا غيره.
--
-- الوضع عندنا قبل الملف ده:
--   • الحماية مفعّلة على كل الجداول بالفعل
--   • ١٢ جدول فيهم قواعد زي members_read_* بتسمح لأي عضو يقرا
--   • ٧ جداول مالهاش قواعد خالص (شغالة بمفتاح الأدمن بس)
--
-- المشكلة اللي لازم نتجنبها:
--   لو ضفنا قاعدة عادية "شوف بيزنسك"، قاعدة البيانات بتجمعها مع القواعد
--   القديمة بـ"أو" — فالعضو هيعدّي من القاعدة القديمة ويشوف داتا غيره،
--   والعزل مايبقاش عزل.
--
-- الحل: قاعدة **مقيِّدة** (restrictive). دي بتتجمع بـ"و" مش بـ"أو"،
-- يعني بتتطبق دايمًا مهما كان فيه قواعد تانية — من غير ما نلمس القديم.
--
-- ملحوظة: مفتاح الأدمن بيعدّي فوق القواعد دي، والسيستم بيستخدمه في أغلب
-- العمليات. فالخطوة دي مش هتغيّر سلوك دلوقتي — هي الأساس، والخطوة ٢.٤
-- هي اللي هتقلل الاعتماد على مفتاح الأدمن.
-- ==========================================================================

-- ===== ١) قاعدة العزل المقيِّدة على كل الجداول =====
do $$
declare
  t text;
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
    execute format('drop policy if exists tenant_isolation on %I', t);
    -- using      = الصفوف اللي ينفع يشوفها ويعدّلها ويمسحها
    -- with check = الصفوف اللي ينفع يضيفها (عشان مايضيفش لبيزنس غيره)
    execute format(
      'create policy tenant_isolation on %I
         as restrictive
         for all
         to authenticated
         using (tenant_id = current_tenant_id())
         with check (tenant_id = current_tenant_id())',
      t
    );
  end loop;
end $$;


-- ===== ٢) جدول البيزنسات =====
-- كل واحد يشوف بيزنسه هو بس، ومحدش يعدّل فيه من المتصفح خالص.
drop policy if exists tenant_self on tenants;
create policy tenant_self on tenants
  for select
  to authenticated
  using (id = current_tenant_id());


-- ===== ٣) تأكيد =====
-- المفروض تلاقي tenant_isolation على 19 جدول، ونوعها RESTRICTIVE:
--
--   select tablename, policyname, permissive
--   from pg_policies
--   where schemaname = 'public' and policyname = 'tenant_isolation'
--   order by tablename;
--
-- والقواعد القديمة لسه مكانها زي ما هي:
--
--   select tablename, count(*) from pg_policies
--   where schemaname = 'public' group by tablename order by tablename;


-- ==========================================================================
-- الرجوع
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
--     execute format('drop policy if exists tenant_isolation on %I', t);
--   end loop;
-- end $$;
-- drop policy if exists tenant_self on tenants;

-- ==========================================================================
-- القيمة الافتراضية مابقتش بترجّع مينيز
-- ==========================================================================
-- `current_tenant_id()` بتقرا بيزنس المستخدم الداخل، **ولو مفيش مستخدم
-- بترجّع بيزنس مينيز الثابت**. والسطر ده اتحط وقت ما كان فيه بيزنس واحد.
--
-- ومفتاح الأدمن **مالوش مستخدم داخل**. يعني أي صف بيتكتب بالمفتاح من غير
-- ما الكود يحط `tenant_id` صراحةً كان بينزل **عند مينيز** مهما كان
-- البيزنس اللي بيعمل العملية.
--
-- اتأكد بالتجربة (١٣ أغسطس ٢٠٢٦): صف اتضاف بمفتاح الأدمن من غير الخانة
-- ونزل في مينيز، واتمسح بعدها.
--
-- **والكود اتظبّط الأول.** كل إضافة بمفتاح الأدمن بقت بتكتب الخانة صراحةً
-- (٢٢ موضع في التطبيق + ٨ في الملفات اللي بتاخد العميل كمعامل)، والحارس
-- `lib/tenant-isolation.test.ts` بقى يوقّع لو حد نسيها. يعني الافتراضي ده
-- مابقاش شايل حاجة في الكود — شايل **دوال شوبيفاي في لوحة سوبابيز** بس،
-- ودول المفروض يقعوا بصوت عالي بدل ما يكتبوا في البيزنس الغلط.
--
-- ⚠️ **شغّل الجزء الأول لوحده الأول واقرا نتيجته.**
-- ==========================================================================


-- ===== ١) قبل أي تغيير: نشوف مين معتمد على الافتراضي =====
-- (قراية بس — مابتغيّرش حاجة)

-- ١-أ) كل التريجرات على جداول الداتا. لو فيه تريجر بيعمل INSERT في جدول
--      فيه `tenant_id` من غير ما يحدده، هيقع بعد التغيير.
select
  c.relname  as "الجدول",
  t.tgname   as "التريجر",
  p.proname  as "الدالة"
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and n.nspname = 'public'
order by c.relname, t.tgname;

-- ١-ب) الجداول اللي الافتراضي شغّال عليها
select
  table_name   as "الجدول",
  is_nullable  as "بيقبل فاضي",
  column_default as "الافتراضي"
from information_schema.columns
where column_name = 'tenant_id'
  and table_schema = 'public'
order by table_name;


-- ===== ٢) التغيير =====
-- بترجّع بيزنس المستخدم، **ولو مفيش مستخدم بترجّع فاضي**.
-- ساعتها الإضافة اللي ناسية الخانة بتترفض (`tenant_id` NOT NULL) بدل ما
-- تنزل في بيزنس غلط في صمت.

create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from app_users where auth_user_id = auth.uid() limit 1;
$$;

comment on function current_tenant_id() is
  'بيزنس المستخدم الداخل — بترجّع فاضي لو مفيش مستخدم (مفتاح الأدمن). الكود لازم يحط tenant_id صراحةً.';


-- ===== ٣) تأكيد =====
-- المفروض ترجّع فاضي هنا، لأن محرّر SQL بيشتغل من غير مستخدم داخل:
--
--   select current_tenant_id();
--
-- وده المفروض **يقع** برسالة null value in column "tenant_id":
--
--   insert into customers (full_name) values ('فحص');
--
-- ولو وقع، ده معناه إن الحماية اشتغلت. (مامتش أي صف — الإضافة اترفضت.)


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- create or replace function current_tenant_id()
-- returns uuid language sql stable security definer set search_path = public
-- as $$
--   select coalesce(
--     (select tenant_id from app_users where auth_user_id = auth.uid() limit 1),
--     '00000000-0000-0000-0000-000000000001'::uuid
--   );
-- $$;

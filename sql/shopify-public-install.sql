-- ==========================================================================
-- تركيب شوبيفاي من غير حساب عندنا — شرط أساسي للتطبيق العام
-- --------------------------------------------------------------------------
-- ⚠️ **التاجر اللي جايّ من شوبيفاي مالوش حساب عندنا.** هو بيدوس «تركيب» في
-- متجر شوبيفاي بتاعه، وشوبيفاي بتوجّهه لمسار التركيب عندنا — من غير أي
-- جلسة. والمسار كان بيرد **٤٠١** وبيقف عنده، ودي حاجة المراجعة بترفض
-- عليها على طول ("your app should immediately authorize using OAuth").
--
-- فالتركيب بقى ممكن يبدأ **بلا بيزنس**: بنتأكد إن الطلب من شوبيفاي فعلًا
-- (بتوقيعها)، بناخد التوكن ونحطه مستنّي، والتاجر يعمل بيزنسه وبعدين
-- التوكن يتسلّم له.
-- ==========================================================================

alter table public.shopify_installs
  -- **البيزنس بقى اختياري** — التركيب اللي بيبدأ من شوبيفاي مالوش بيزنس
  -- لحد ما التاجر يعمل حسابه
  alter column tenant_id drop not null;

alter table public.shopify_installs
  -- التوكن بيستنى هنا لحد ما بيزنس يتسلّمه.
  -- **بيتمسح أول ما يتسلّم** — مانسيبش توكن في مكانين
  add column if not exists access_token text,
  -- اتسلّم امتى ولمين
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by uuid;

comment on column public.shopify_installs.access_token is
  'توكن مستنّي بيزنس يتسلّمه — بيتمسح أول ما يتنقل لـtenant_credentials';
comment on column public.shopify_installs.claimed_at is
  'امتى بيزنس تسلّم التركيب ده';

-- المسار بيدوّر على التركيبات المستنية بالمتجر
create index if not exists shopify_installs_pending
  on public.shopify_installs (shop)
  where access_token is not null and claimed_at is null;


-- ===== التأكيد =====
--   select shop, tenant_id is null as مستني, claimed_at
--   from public.shopify_installs order by created_at desc limit 10;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop index if exists public.shopify_installs_pending;
-- alter table public.shopify_installs
--   drop column if exists access_token,
--   drop column if exists claimed_at,
--   drop column if exists claimed_by;
-- -- ⚠️ الرجوع لـnot null بيفشل لو فيه صفوف بلا بيزنس — امسحها الأول:
-- -- delete from public.shopify_installs where tenant_id is null;
-- alter table public.shopify_installs alter column tenant_id set not null;

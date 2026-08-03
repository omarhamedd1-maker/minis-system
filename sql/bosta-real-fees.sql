-- ==========================================================================
-- رسوم بوسطة الحقيقية بدل التقدير
-- --------------------------------------------------------------------------
-- بوسطة بترجّع كشف حساب مفصّل بالرسوم اللي خدتها فعلًا من كل شحنة
-- (`wallet.cashCycle`)، بس المسار اللي المزامنة بتستخدمه مابيرجّعوش —
-- لازم نجيب الشحنة لوحدها. فبنجيبه مرة واحدة لما الشحنة تخلص ونخزّنه هنا.
--
-- ليه ده مهم: أوردر ١٠٧٤ تقديرنا كان ٣٧٫٦٢ والحقيقي ١٣٥٫٦٦، والشحن الحقيقي
-- ١١٣ مش ٨٨ اللي السيستم مفترضها. يعني ربح كل أوردر عندنا فيه فرق.
--
-- الأعمدة دي **بتتضاف جنب التقدير مش بداله** — التقدير بيفضل للشحنات اللي
-- لسه شغالة (لأن بوسطة مابتقفلش الحساب غير بعد ما تخلص).
-- ==========================================================================

alter table public.orders
  add column if not exists bosta_fees_real numeric,
  add column if not exists bosta_ship_fee_real numeric,
  add column if not exists bosta_fees_at timestamptz;

comment on column public.orders.bosta_fees_real is
  'إجمالي اللي بوسطة خدته فعلًا من كشف حسابها (bosta_fees) — مش تقدير';
comment on column public.orders.bosta_ship_fee_real is
  'رسم الشحن لوحده من كشف بوسطة — منه بنعرف الباقة بتغطي كام فعلًا';
comment on column public.orders.bosta_fees_at is
  'امتى جبنا الكشف. موجود = مانجيبوش تاني، الرقم نهائي';

-- بيسرّع لقطة "مين لسه محتاج نجيبله الرسوم" في كل مزامنة
create index if not exists orders_fees_pending_idx
  on public.orders (tenant_id)
  where bosta_fees_at is null and bosta_tracking is not null;

-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop index if exists public.orders_fees_pending_idx;
-- alter table public.orders
--   drop column if exists bosta_fees_real,
--   drop column if exists bosta_ship_fee_real,
--   drop column if exists bosta_fees_at;

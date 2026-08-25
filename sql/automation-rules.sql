-- ==========================================================================
-- قواعد الأتمتة — «لو حصل كذا، نبّهني»
-- --------------------------------------------------------------------------
-- كل تنبيه في السيستم دلوقتي مكتوب في الكود بحدوده: الأوردر القاعد ٤ أيام،
-- والمخزون تحت ١٤ يوم، والشحنة الواقفة ٥ أيام. الأرقام دي **قرار صاحب
-- المتجر مش قرار الكود** — واحد بيستنى يومين وواحد عنده منتج بيخلص في
-- أسبوع. ودلوقتي عشان يتغيّر رقم لازم كود يتكتب ويترفع.
--
-- ⚠️⚠️ **القواعد بتنبّه بس — مابتعملش حاجة في الداتا.** ولا بتلغي أوردر
-- ولا بتغيّر حالة ولا بتبعت للعميل. السيستم اللي بيتصرّف لوحده في فلوس
-- وشحنات محدش بيثق فيه، وأول غلطة بيتقفل.
--
-- ⚠️ **والتنبيه بيتقال مرة لكل حالة** — التاج (`rule-<القاعدة>-<الأوردر>`)
-- بيتخزّن في `notification_log`، فالأوردر اللي عدّى الشرط بيتقال عليه مرة
-- مش كل ربع ساعة لحد ما يتصلّح.
-- ==========================================================================

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  -- order_waiting | order_not_shipped | shipment_stuck | stock_low
  -- | big_order | cod_gap
  trigger text not null,
  -- الحد: أيام أو جنيه أو قطع حسب النوع
  threshold numeric not null check (threshold > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists automation_rules_tenant_idx
  on automation_rules (tenant_id, active);

-- ⚠️ **نفس النوع مرتين لنفس البيزنس مالوش لازمة** — الحد الواحد بيكفّي،
-- والقاعدتين على نفس النوع معناهما تنبيهين على نفس الأوردر.
create unique index if not exists automation_rules_once
  on automation_rules (tenant_id, trigger);

alter table automation_rules enable row level security;


-- ===== التأكيد =====
select count(*) as "قواعد" from automation_rules;


-- ===== وللتراجع =====
--   drop table if exists automation_rules;

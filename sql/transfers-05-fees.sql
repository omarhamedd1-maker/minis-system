-- ==========================================================================
-- بنود كشف المحفظة — الرسوم والتعويضات والتحصيل (TRANSFERS §٧.١)
-- --------------------------------------------------------------------------
-- ⚠️⚠️ **الكشف الكامل دفتر حركات مش قايمة تحويلات.** كل سطر فيه حركة
-- واحدة بتصنيفها: التحويل نفسه (`Cash Out`)، أو رسوم، أو تحصيل، أو
-- تعويض. التحويلات بتروح `courier_payouts` زي ما هي، والباقي هنا.
--
-- **التصنيفات اللي اتشافت (٩):**
--   Cash Collection Cycle · Bosta Fees Cycle · Pickup Fees ·
--   Packing Material · Bundle Subscription · Compensation ·
--   Recharge balance · Balance Adjustment · Cash Out
--
-- ⚠️ **بنخزّن التصنيف زي ما بوسطة كتباه** — المجموعات (رسوم شحن · ثابتة ·
-- دخل) بتتحسب في الكود (`lib/courier-fees.ts`)، مش في الداتابيز. بوسطة لو
-- ضافت تصنيف جديد بكرة بيتخزّن ويتعرض «غير ده» بدل ما يضيع.
--
-- ⚠️ **والمبلغ بإشارته زي ما هو**: الرسوم بالسالب والتحصيل والتعويض
-- بالموجب. التوحيد للعرض بس.
--
-- ⛔ **الجدول ده مايعملش حركات خزنة** — زي باقي جداول التحويلات، بيوصف
-- الفلوس ومابيعملهاش (`sql/transfers-01-tables.sql`).
-- ==========================================================================

create table if not exists courier_fee_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  courier text not null default 'bosta',
  -- `Transactions ID` من الكشف — ده اللي بيمنع التكرار بين الرفعات
  txn_id text not null,
  line_date date not null,
  -- زي ما بوسطة كتباه بالظبط
  category text not null,
  -- بالسالب للمصروف وبالموجب للدخل
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table courier_fee_lines enable row level security;

-- ⚠️ **نفس الحركة مرتين = التانية بتتعدّى** — الكشف بيتنزل كامل كل مرة،
-- والرفعة التانية بتحتوي كل اللي قبلها
create unique index if not exists courier_fee_lines_once
  on courier_fee_lines (tenant_id, courier, txn_id);

create index if not exists courier_fee_lines_recent
  on courier_fee_lines (tenant_id, line_date desc);

comment on table courier_fee_lines is
  'بنود كشف محفظة شركة الشحن — رسوم وتعويضات وتحصيل. بتوصف الفلوس ومابتعملهاش';


-- ===== تأكيد =====
select t.name,
       count(*) as "بنود",
       count(distinct f.category) as "تصنيفات",
       round(sum(f.amount)::numeric, 2) as "المجموع"
from courier_fee_lines f
join tenants t on t.id = f.tenant_id
group by t.name
order by t.name;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop table if exists courier_fee_lines;

-- ==========================================================================
-- التحويلات — الأرشفة (TRANSFERS · قرار عمر ٢١ سبتمبر)
-- --------------------------------------------------------------------------
-- التحويل ليه تلات أفعال، ومافيش فيهم «حذف»:
--
--   فُك الربط    ← الحركة تفضل، والتحويل يرجع «محتاج مراجعة»
--   ألغِ التحويل ← يتشال، **وحركته** (اللي هو عملها) تتلغي بحركة عكسية
--   أخفِ         ← يتأرشف ويفضل في التاريخ
--
-- ⚠️⚠️ **ليه مافيش زرار «حذف»:** نفس قاعدة حركات الخزنة (MONEY §٦.٢).
-- في سجل مالي، المسح بيغيّر الرصيد بأثر رجعي ومحدش يعرف ليه — الرقم
-- بيتغيّر والسبب بيختفي معاه.
--
-- والعمود ده **مش حالة** — الحالة (`status`) بتقول التحويل مظبوط ولا لأ،
-- والأرشفة بتقول «مش عايز أشوفه». التحويل المؤرشف لسه محسوب ولسه مربوط.
-- ==========================================================================

alter table courier_payouts
  add column if not exists archived boolean not null default false;

comment on column courier_payouts.archived is
  'متخفي من التاب — ولسه في التاريخ وفي الحسابات';

create index if not exists courier_payouts_visible
  on courier_payouts (tenant_id, archived, payout_date desc);


-- ===== تأكيد =====
select t.name,
       count(*) filter (where not p.archived) as "ظاهر",
       count(*) filter (where p.archived) as "متأرشف"
from courier_payouts p
join tenants t on t.id = p.tenant_id
group by t.name
order by t.name;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop index if exists courier_payouts_visible;
-- alter table courier_payouts drop column if exists archived;

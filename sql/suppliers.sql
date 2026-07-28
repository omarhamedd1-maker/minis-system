-- ==========================================================================
-- صفحة الموردين — شغّل السكريبت ده مرة واحدة في Supabase → SQL Editor
--
-- الفكرة:
--   suppliers              = المورد نفسه (اسم/تليفون/ملاحظات)
--   supplier_transactions  = حركاته: فاتورة بضاعة (purchase) أو دفعة (payment)
--   اللي عليك للمورد = مجموع الفواتير − مجموع الدفعات
--
-- الفاتورة مابتلمسش الخزنة (لأن تكلفة البضاعة بتتحسب أصلاً في ربح الأوردر).
-- الدفعة بتخصم من الخزنة، وبنسيب الـ id بتاع حركة الخزنة في related_cash_id
-- عشان لو مسحت الدفعة تتمسح الحركة من الخزنة معاها.
--
-- مافيش policies على الجدولين — يعني بس السيستم (service role) بيقراهم ويكتب
-- فيهم، والصلاحيات بتتحكم من صفحة المستخدمين (suppliers.view / suppliers.edit).
-- ==========================================================================

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);
alter table suppliers enable row level security;

create table if not exists supplier_transactions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'payment')),
  amount numeric not null check (amount > 0),
  description text,
  txn_date date not null default current_date,
  related_cash_id uuid,
  created_at timestamptz not null default now()
);
alter table supplier_transactions enable row level security;

create index if not exists supplier_transactions_supplier_idx
  on supplier_transactions (supplier_id);

-- الشركاء (Owner) عشان يشوفوا الموردين — من غير ما يعدّلوا
update app_users
set permissions = array(select distinct unnest(permissions || array['suppliers.view']))
where role_id = (select id from roles where lower(name) = 'owner');

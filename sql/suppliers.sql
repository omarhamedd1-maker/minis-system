-- ==========================================================================
-- صفحة الموردين — شغّل السكريبت ده مرة واحدة في Supabase → SQL Editor
--
-- الفكرة:
--   suppliers              = المورد نفسه (اسم/تليفون/ملاحظات)
--   supplier_transactions  = حركاته: فاتورة بضاعة (purchase) أو دفعة (payment)
--   اللي عليك للمورد = مجموع الفواتير − مجموع الدفعات
--
-- الفاتورة بتتسجل مصروف (related_expense_id) ومابتلمسش الخزنة — الفلوس لسه ماطلعتش.
-- الدفعة بتخصم من الخزنة (related_cash_id). لو مسحت أي حركة، بيتمسح أثرها كله.
-- supplier_invoice_items = تفاصيل البضاعة اللي جِت في الفاتورة (صنف/كمية/سعر القطعة).
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

-- ===== الإضافة التانية: الفاتورة كمصروف + تفاصيل البضاعة =====
alter table supplier_transactions
  add column if not exists related_expense_id uuid;
alter table supplier_transactions
  add column if not exists stock_applied boolean not null default false;

create table if not exists supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null
    references supplier_transactions(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null,
  item_name text not null,
  quantity numeric not null check (quantity > 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now()
);
alter table supplier_invoice_items enable row level security;

create index if not exists supplier_invoice_items_txn_idx
  on supplier_invoice_items (transaction_id);

-- الشركاء (Owner) عشان يشوفوا الموردين — من غير ما يعدّلوا
update app_users
set permissions = array(select distinct unnest(permissions || array['suppliers.view']))
where role_id = (select id from roles where lower(name) = 'owner');

-- ==========================================================================
-- التحويلات — الجداول (TRANSFERS §٥ · الخطوة ١)
-- --------------------------------------------------------------------------
-- بوسطة بتحوّل فلوس التحصيل بدفعات (٥ مرات في الأسبوع)، وكل دفعة ليها رقم
-- فاتورة وعدد أوردرات ورسوم. دلوقتي بتتسجّل سطر يدوي بمبلغ مقرّب من غير
-- أي ربط — فالفرق بين اللي عند بوسطة واللي في الخزنة مالوش مصدر.
--
-- ⚠️ **الأسامي عامة مش «بوسطة»** — المرحلة ٦ هتفصل شركة الشحن، ومفيش سبب
-- نكرر غلطة `bosta_cashouts`.
--
-- ⚠️⚠️ **الجداول دي بتوصف الفلوس، ومابتعملهاش.** حركة الخزنة بتفضل في
-- `cash_transactions` زي ما هي، والربط بينهم عمود واحد. يعني لو الجداول
-- دي اتمسحت بكرة، الرصيد مايتغيّرش.
--
-- كلهم `tenant_id` + RLS. والويب هوك بيكتب بمفتاح الأدمن (مالوش مستخدم
-- داخل) — فالـ`tenant_id` بيتحط صريح من العنوان السري اللي وصل عليه.
-- ==========================================================================

-- ===== ١. التحويل نفسه =====
create table if not exists courier_payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  -- مين حوّل — 'bosta' دلوقتي، والعمود موجود عشان المرحلة ٦
  courier text not null default 'bosta',
  -- SUNCOD06SEP26 — فريد **لكل بيزنس** مش عالميًا
  invoice_number text not null,
  payout_date date not null,
  -- دورات التحصيل: اللي العملاء دفعوه
  gross_amount numeric not null default 0,
  -- رسوم شركة الشحن. ⚠️ **للعرض بس** — متخصومة من كل أوردر أصلًا (§٧)
  fees_amount numeric not null default 0,
  -- اللي نزل الحساب فعلًا = gross − fees
  net_amount numeric not null default 0,
  -- عدد الأوردرات من الإيميل/الكشف — هو اللي بيخلي المطابقة مضمونة
  order_count integer,
  -- 'matched' اتطابق تلقائي · 'needs_review' محتاج عين · 'confirmed' عمر أكّد
  status text not null default 'needs_review',
  -- ليه محتاج مراجعة — بيتعرض في التبويب زي ما هو
  review_reason text,
  -- حركة الخزنة المربوطة. ⚠️ `set null` عشان مسح الحركة مايمسحش التحويل
  cash_transaction_id uuid references cash_transactions(id) on delete set null,
  -- 'email' | 'manual' | 'import'
  source text not null default 'manual',
  raw_email_id uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table courier_payouts enable row level security;

-- ⚠️ **رقم الفاتورة مايتكررش في نفس البيزنس** — ده اللي بيمنع الإيميل
-- المتكرر (أو نفس الكشف يترفع مرتين) إنه يعمل تحويلين
create unique index if not exists courier_payouts_invoice
  on courier_payouts (tenant_id, courier, invoice_number);

create index if not exists courier_payouts_recent
  on courier_payouts (tenant_id, payout_date desc);


-- ===== ٢. أوردرات كل تحويل =====
create table if not exists courier_payout_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  payout_id uuid not null references courier_payouts(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  -- اللي العميل دفعه على الأوردر ده، ونصيبه من الرسوم
  cod_amount numeric not null default 0,
  fee_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table courier_payout_orders enable row level security;

-- ⚠️ **الأوردر مايتحسبش في تحويلين** — ده أخطر ازدواج ممكن يحصل هنا
create unique index if not exists courier_payout_orders_once
  on courier_payout_orders (tenant_id, order_id);

create index if not exists courier_payout_orders_payout
  on courier_payout_orders (payout_id);


-- ===== ٣. سجل الإيميلات =====
-- كل إيميل وصل بيتسجّل — حتى المرفوض. من غير السجل، الإيميل اللي مااشتغلش
-- مالوش أثر ومحدش يعرف إنه جه أصلًا.
create table if not exists courier_payout_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  from_address text,
  subject text,
  received_at timestamptz not null default now(),
  -- التوقيع عدّى؟ (DKIM بتاع شركة الشحن — §٤)
  dkim_ok boolean,
  parsed_ok boolean not null default false,
  payout_id uuid references courier_payouts(id) on delete set null,
  error text,
  raw text,
  created_at timestamptz not null default now()
);

alter table courier_payout_emails enable row level security;

create index if not exists courier_payout_emails_recent
  on courier_payout_emails (tenant_id, received_at desc);


-- ===== ٤. الربط من ناحية حركة الخزنة =====
-- الحركة بتعرف تحويلها، فسطر الدفتر يقدر يفتح تفاصيله من غير دوران
alter table cash_transactions
  add column if not exists related_payout_id uuid
    references courier_payouts(id) on delete set null;

create index if not exists cash_transactions_payout
  on cash_transactions (tenant_id, related_payout_id);


-- ===== تأكيد =====
select
  (select count(*) from courier_payouts)        as "تحويلات",
  (select count(*) from courier_payout_orders)  as "أوردرات مربوطة",
  (select count(*) from courier_payout_emails)  as "إيميلات",
  (select count(*) from bosta_cashouts)         as "القديم (المفروض صفر)";


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- alter table cash_transactions drop column if exists related_payout_id;
-- drop table if exists courier_payout_emails;
-- drop table if exists courier_payout_orders;
-- drop table if exists courier_payouts;

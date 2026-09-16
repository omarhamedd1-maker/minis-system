-- ==========================================================================
-- الخزنة: مين سجّل الحركة · والإلغاء بحركة عكسية بدل المسح
-- (MONEY-PAGE-REDESIGN ٦.١ و٦.٢ — ١٦ سبتمبر ٢٠٢٦)
-- --------------------------------------------------------------------------
-- ⚠️ **المسح بيغيّر الرصيد بأثر رجعي ومحدش يعرف ليه.** الحركة العكسية بتسيب
-- الأصل مكانه وتضيف حركة بالعكس — الرصيد نفس النتيجة، والتاريخ باين.
--
-- ⚠️ **الربط بالمصروف والأوردر بيمنع ده دلوقتي.** اتجرّب على التجريبي:
-- مسح مصروف عليه حركة خزنة بيترفض (cash_transactions_related_expense_id_fkey)،
-- فالكود بيمسح الحركة الأول. عشان الحركة تفضل بعد مسح المصروف أو الأوردر،
-- الربط لازم يبقى «يتفضّى» (on delete set null) مش «يمنع».
--
-- ⚠️ الملف ده **بيضيف بس** — مابيمسحش ولا بيغيّر أي صف موجود.
-- الكود اللي بيستخدمه لسه ماتكتبش — بيتكتب بعد ما الملف يتشغّل.
-- ==========================================================================


-- ===== ١) مين سجّل الحركة ومنين =====
-- created_by       → app_users.id (فاضي لو من المزامنة)
-- created_by_name  → الاسم وقت التسجيل (عشان لو الحساب اتمسح الاسم يفضل)
-- origin           → app · bosta-cashout · prepaid · import · system
alter table cash_transactions
  add column if not exists created_by uuid,
  add column if not exists created_by_name text,
  add column if not exists origin text;


-- ===== ٢) الحركة العكسية =====
-- reversal_of → الحركة اللي اتلغت. حركة واحدة بس ممكن تلغي حركة معيّنة.
alter table cash_transactions
  add column if not exists reversal_of uuid references cash_transactions (id) on delete restrict;

create unique index if not exists cash_transactions_one_reversal
  on cash_transactions (reversal_of)
  where reversal_of is not null;


-- ===== ٣) الربط بالمصروف والأوردر: يتفضّى بدل ما يمنع المسح =====
do $$
declare
  c record;
begin
  for c in
    select con.conname, att.attname, ref.relname as ref_table
    from pg_constraint con
    join pg_class tbl on tbl.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and tbl.relname = 'cash_transactions'
      and att.attname in ('related_expense_id', 'related_order_id')
  loop
    execute format('alter table cash_transactions drop constraint %I', c.conname);
    execute format(
      'alter table cash_transactions add constraint %I foreign key (%I) references %I (id) on delete set null',
      c.conname, c.attname, c.ref_table
    );
  end loop;
end $$;


-- ===== تأكيد =====
-- المفروض: ٤ خانات جديدة · والربطين confdeltype = 'n' (set null)
select column_name
from information_schema.columns
where table_name = 'cash_transactions'
  and column_name in ('created_by', 'created_by_name', 'origin', 'reversal_of')
order by column_name;

select con.conname, con.confdeltype as "عند المسح (n = يتفضّى)"
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
where tbl.relname = 'cash_transactions' and con.contype = 'f'
order by con.conname;

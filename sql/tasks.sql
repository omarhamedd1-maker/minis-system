-- ==========================================================================
-- تاسكات التيم
-- --------------------------------------------------------------------------
-- شغل التيم اليومي: مين عليه إيه، وامتى، وخلص ولا لأ. التاسك ينفع يبقى
-- مربوط بأوردر («كلّم عميل أوردر ١٣٧٤») أو مستقل («صوّر المنتج الجديد»).
--
-- تلات جداول:
--   tasks          التاسك نفسه
--   task_steps     خطوات جوّه التاسك الواحد (مربعات تتعلّم)
--   task_comments  كلام التيم تحت التاسك
--
-- والعزل زي أي جدول تاني: `tenant_id` بتتملّي لوحدها من `current_tenant_id()`
-- وعليها قاعدة **مقيِّدة** — مقيِّدة عشان تتجمع بـ"و" مش بـ"أو"، وده الدرس
-- اللي اتعلمناه في `tenants-03-rules.sql`.
-- ==========================================================================

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),

  title text not null,
  body text,

  -- 'open' | 'doing' | 'done'
  status text not null default 'open',
  -- 'urgent' | 'normal'
  priority text not null default 'normal',

  -- مين عليه التاسك. null = مسنودش لحد لسه
  assignee_id uuid references app_users(id) on delete set null,
  -- بنخزّن الاسم كمان عشان لو المستخدم اتشال التاسك يفضل مفهوم
  assignee_name text,

  -- التاريخ بس من غير وقت — الشغل اليومي مابيتقاسش بالساعة
  due_on date,

  -- مربوط بأوردر؟ لو الأوردر اتمسح التاسك يفضل بس من غير رابط
  order_id uuid references orders(id) on delete set null,

  created_by text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by text
);

create table if not exists task_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  -- الترتيب اللي المستخدم حطهم بيه
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ===== العزل =====
alter table tasks enable row level security;
alter table task_steps enable row level security;
alter table task_comments enable row level security;

do $$
declare
  t text;
  tables constant text[] := array['tasks', 'task_steps', 'task_comments'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I
         as restrictive
         for all
         to authenticated
         using (tenant_id = current_tenant_id())
         with check (tenant_id = current_tenant_id())', t
    );
  end loop;
end $$;

-- ===== الفهارس =====
-- الشاشة الأساسية: تاسكات البيزنس المفتوحة بترتيب الأولوية والميعاد
create index if not exists tasks_board on tasks (tenant_id, status, due_on);
-- «اللي عليّا» — أهم فلتر للموظف
create index if not exists tasks_mine on tasks (tenant_id, assignee_id, status);
-- تاسكات الأوردر بتتعرض جوّه شاشته
create index if not exists tasks_of_order on tasks (order_id) where order_id is not null;
create index if not exists task_steps_of_task on task_steps (task_id, position);
create index if not exists task_comments_of_task on task_comments (task_id, created_at);

-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop table if exists task_comments;
-- drop table if exists task_steps;
-- drop table if exists tasks;

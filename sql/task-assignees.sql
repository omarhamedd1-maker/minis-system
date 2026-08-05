-- ==========================================================================
-- أكتر من شخص على التاسك الواحد
-- --------------------------------------------------------------------------
-- كان `tasks.assignee_id` — شخص واحد بس. الشغل الحقيقي مش كده: «جهّزوا
-- أوردرات النهاردة» عليها تلاتة.
--
-- جدول ربط بدل عمود، عشان:
--   • الفلتر «اللي عليّا» يبقى استعلام واحد بفهرس، مش تفتيش في مصفوفة
--   • نخزّن الاسم جنب الرقم فلو المستخدم اتشال التاسك يفضل مفهوم
--
-- والعمودين القدام (`assignee_id` و`assignee_name`) **بقوا مش مستخدمين** —
-- سايبينهم مؤقتًا لحد ما نتأكد إن كل حاجة ماشية، وأمر مسحهم في آخر الملف.
-- ==========================================================================

create table if not exists task_assignees (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  -- الاسم وقت الإسناد — للعرض بس
  user_name text,
  tenant_id uuid not null default current_tenant_id(),
  created_at timestamptz not null default now(),
  -- نفس الشخص مايتسندش مرتين لنفس التاسك
  primary key (task_id, user_id)
);

alter table task_assignees enable row level security;

drop policy if exists tenant_isolation on task_assignees;
create policy tenant_isolation on task_assignees
  as restrictive
  for all
  to authenticated
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- «اللي عليّا» — أهم استعلام في الشاشة
create index if not exists task_assignees_of_user
  on task_assignees (tenant_id, user_id);
create index if not exists task_assignees_of_task
  on task_assignees (task_id);

-- ===== نقل اللي مسنود خلاص =====
-- التاسكات اللي عليها شخص واحد بتنقل زي ما هي
insert into task_assignees (task_id, user_id, user_name, tenant_id)
select t.id, t.assignee_id, t.assignee_name, t.tenant_id
from tasks t
where t.assignee_id is not null
on conflict (task_id, user_id) do nothing;

-- ===== تأكيد =====
--   select count(*) from task_assignees;
--   select t.title, a.user_name
--   from tasks t join task_assignees a on a.task_id = t.id
--   order by t.created_at desc limit 20;

-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop table if exists task_assignees;

-- ===== بعد ما نتأكد إن كل حاجة ماشية (مش دلوقتي) =====
-- alter table tasks
--   drop column if exists assignee_id,
--   drop column if exists assignee_name;

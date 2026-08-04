-- ==========================================================================
-- التاسك اللي بيتكرر + المرفقات
-- --------------------------------------------------------------------------
-- ملف تاني بعد `tasks.sql` لأن الجداول اتعملت خلاص.
--
-- **التكرار شغال بمنطق «واحد مفتوح بس»**: التاسك المتكرر بيولّد نسخة جديدة
-- لما يجي ميعادها **وبشرط إن مفيش نسخة مفتوحة منه**. من غير الشرط ده، تاسك
-- يومي مانسيتوش أسبوع بيولّد ٧ نسخ ويغرق اللوحة.
-- ==========================================================================

alter table public.tasks
  -- 'daily' | 'weekly' | 'monthly' | null (مرة واحدة)
  add column if not exists repeat_kind text,
  -- النسخة دي اتولدت من أنهي تاسك؟ الأصل نفسه بيفضل فاضي
  add column if not exists repeat_parent_id uuid references public.tasks(id) on delete set null,
  -- المرفقات: مسارات الملفات في التخزين + اسمها الأصلي
  --   [{ "path": "tenant/task/uuid.jpg", "name": "المنتج.jpg" }]
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.tasks.repeat_kind is
  'يومي/أسبوعي/شهري — التاسك بيولّد نسخة جديدة لما ميعادها ييجي';
comment on column public.tasks.repeat_parent_id is
  'التاسك الأصل اللي النسخة دي اتولدت منه';
comment on column public.tasks.attachments is
  'ملفات مرفوعة في bucket اسمه task-files';

-- المولّد بيدوّر على المتكررين بس — فهرس صغير يخليها رخيصة
create index if not exists tasks_repeating
  on public.tasks (tenant_id, repeat_kind)
  where repeat_kind is not null;

-- ==========================================================================
-- التخزين — bucket المرفقات
-- --------------------------------------------------------------------------
-- **مقفول بقصد**: الملفات بتتقرا بروابط موقّتة من السيرفر بس، مش لينكات
-- مفتوحة. صورة إثبات شغل ممكن يبقى فيها عنوان عميل أو فاتورة.
-- ==========================================================================

insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', false)
on conflict (id) do nothing;

-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop index if exists public.tasks_repeating;
-- alter table public.tasks
--   drop column if exists repeat_kind,
--   drop column if exists repeat_parent_id,
--   drop column if exists attachments;
-- delete from storage.buckets where id = 'task-files';

-- ==========================================================================
-- جدولة توليد التاسكات المتكررة — كل ساعة
-- --------------------------------------------------------------------------
-- **بياخد المفتاح من المهمة الموجودة** بدل ما تكتبه بإيدك: بننسخ أمر
-- `bosta-sync-15min` ونستبدل المسار بس. كده المفتاح مايتكتبش في أي ملف.
--
-- كل ساعة كفاية — التاسك اليومي/الأسبوعي مش محتاج دقة أعلى من كده.
-- ==========================================================================

-- select cron.schedule(
--   'tasks-recur-hourly',
--   '5 * * * *',
--   replace(
--     (select command from cron.job where jobname = 'bosta-sync-15min'),
--     '/api/bosta/sync',
--     '/api/tasks/recur'
--   )
-- );

-- ===== تشوف المهمة اشتغلت ولا لأ =====
--   select jobid, status, start_time, return_message
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'tasks-recur-hourly')
--   order by start_time desc limit 10;

-- ===== إيقافها =====
--   select cron.unschedule('tasks-recur-hourly');

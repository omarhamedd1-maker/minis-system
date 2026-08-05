-- ==========================================================================
-- تنبيهات التاسك + التكرار الكاستم
-- --------------------------------------------------------------------------
-- حاجتين في ملف واحد لأنهم بيتعملوا على نفس الجدول:
--
--   ١. **التكرار الكاستم**: كان يومي/أسبوعي/شهري بس. دلوقتي فيه `custom`
--      ومعاها «كل كام × وحدة» — كل ٣ أيام، كل أسبوعين، كل ٦ شهور.
--
--   ٢. **تنبيه على التاسك**: يا إما مرة واحدة في وقت محدد، يا إما كل كذا
--      **طول ما التاسك ماخلصش**.
--
-- الأعمدة كلها اختيارية وبقيم فاضية، فالتاسكات الموجودة مابيحصلهاش حاجة.
-- ==========================================================================

alter table public.tasks
  -- ===== التكرار الكاستم =====
  -- `repeat_kind` بقى ياخد 'custom' كمان جنب daily/weekly/monthly
  add column if not exists repeat_every integer,
  -- 'day' | 'week' | 'month'
  add column if not exists repeat_unit text,

  -- ===== التنبيه =====
  -- امتى التنبيه الجاي. فاضي = مفيش تنبيه على التاسك ده
  add column if not exists remind_at timestamptz,
  -- يتكرر كل كام؟ فاضي = مرة واحدة وخلاص
  add column if not exists remind_every integer,
  -- 'hour' | 'day' | 'week'
  add column if not exists remind_unit text,
  -- اتبعت كام مرة — **ده اللي بيمنع الزنّ**: فيه سقف في الكود (٣٠) وبعده
  -- بيسكت. تنبيه كل ساعة على تاسك اتنسي شهر = ٧٢٠ إشعار من غير السقف
  add column if not exists remind_count smallint not null default 0,
  -- آخر مرة اتبعت فيها — للتشخيص بس
  add column if not exists remind_last_at timestamptz;

comment on column public.tasks.repeat_every is
  'التكرار الكاستم: كل كام وحدة (مع repeat_unit)';
comment on column public.tasks.repeat_unit is
  'day / week / month — بتتقرا لما repeat_kind = custom';
comment on column public.tasks.remind_at is
  'ميعاد التنبيه الجاي. المسار /api/tasks/recur بيدوّر على اللي ميعاده فات';
comment on column public.tasks.remind_every is
  'التنبيه يتكرر كل كام (مع remind_unit). فاضي = مرة واحدة';
comment on column public.tasks.remind_count is
  'عدد التنبيهات اللي اتبعتت — سقفه ٣٠ في الكود وبعده بيسكت';

-- ==========================================================================
-- الفهرس
-- --------------------------------------------------------------------------
-- المسار بيسأل كل شوية: «مين ميعاده جه ولسه ماخلصش؟». من غير فهرس ده مسح
-- كامل للجدول كل نداء.
--
-- **جزئي بقصد** — التاسكات اللي عليها تنبيه قليلة جدًا مقارنة بالكل.
-- ==========================================================================

create index if not exists tasks_reminders_due
  on public.tasks (tenant_id, remind_at)
  where remind_at is not null and status <> 'done';


-- ==========================================================================
-- التأكيد
-- ==========================================================================
--   select id, title, remind_at, remind_every, remind_unit, remind_count
--   from public.tasks
--   where remind_at is not null
--   order by remind_at;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop index if exists public.tasks_reminders_due;
-- alter table public.tasks
--   drop column if exists repeat_every,
--   drop column if exists repeat_unit,
--   drop column if exists remind_at,
--   drop column if exists remind_every,
--   drop column if exists remind_unit,
--   drop column if exists remind_count,
--   drop column if exists remind_last_at;


-- ==========================================================================
-- ⚠️ الجدولة — لازم تتعمل عشان التنبيهات تشتغل أصلاً
-- --------------------------------------------------------------------------
-- **المسار موجود ومحدش بيناديه.** نفس مشكلة توليد التاسكات المتكررة
-- المكتوبة في آخر `tasks-recurring.sql` — والاتنين بقوا على نفس المسار
-- دلوقتي، فمهمة واحدة بتعمل الاتنين.
--
-- **وكل ١٥ دقيقة مش كل ساعة**: تنبيه بالساعة على الساعة الواحدة يوصل
-- ٢:٠٠ لو المهمة بتشتغل كل ساعة. ربع ساعة دقة كفاية والتكلفة صفر.
--
-- بياخد المفتاح من مهمة المزامنة بدل ما تكتبه بإيدك — كده المفتاح
-- مايتكتبش في أي ملف.
-- ==========================================================================

-- select cron.schedule(
--   'tasks-tick-15min',
--   '*/15 * * * *',
--   replace(
--     (select command from cron.job where jobname = 'bosta-sync-15min'),
--     '/api/bosta/sync',
--     '/api/tasks/recur'
--   )
-- );

-- ===== لو كنت جدولت المهمة القديمة بالساعة، شيلها الأول =====
--   select cron.unschedule('tasks-recur-hourly');

-- ===== تشوف المهمة اشتغلت ولا لأ =====
--   select jobid, status, start_time, return_message
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'tasks-tick-15min')
--   order by start_time desc limit 10;

-- ===== إيقافها =====
--   select cron.unschedule('tasks-tick-15min');

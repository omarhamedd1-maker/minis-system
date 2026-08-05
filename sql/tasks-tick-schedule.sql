-- ==========================================================================
-- جدولة شغل التاسكات الدوري — انسخ الملف ده كله وشغّله مرة واحدة
-- --------------------------------------------------------------------------
-- المسار `/api/tasks/recur` بيعمل حاجتين: يولّد نسخ التاسكات المتكررة،
-- ويبعت التنبيهات اللي ميعادها جه. **موجود من زمان ومحدش بيناديه** — فمن
-- غير الملف ده التنبيه اللي تظبّطه مايرنّش.
--
-- **كل ربع ساعة مش كل ساعة**: تنبيه على الساعة الواحدة كان هيوصل ٢:٠٠ لو
-- المهمة بالساعة. ربع ساعة دقة كافية وتكلفتها صفر.
--
-- والأمر **بياخد المفتاح من مهمة المزامنة** بدل ما يتكتب في الملف — كده
-- `SYNC_KEY` مايعدّيش في جيت ولا في شات.
--
-- ينفع يتشغّل أكتر من مرة: بيشيل القديم الأول وبعدين بيجدول.
-- ==========================================================================

do $$
declare
  sync_cmd text;
begin
  select command into sync_cmd
  from cron.job
  where jobname = 'bosta-sync-15min';

  -- **مالقيناش مهمة المزامنة؟ نقف** — من غيرها مفيش مفتاح، وجدولة أمر
  -- ناقص معناها مهمة بتفشل كل ربع ساعة في صمت
  if sync_cmd is null then
    raise exception
      'مالقيتش مهمة المزامنة bosta-sync-15min — شوف sql/cron-jobs.sql الأول';
  end if;

  -- المهمة القديمة بالساعة (لو كانت اتجدولت) بتتشال — الجديدة بتغطّيها
  if exists (select 1 from cron.job where jobname = 'tasks-recur-hourly') then
    perform cron.unschedule('tasks-recur-hourly');
  end if;

  if exists (select 1 from cron.job where jobname = 'tasks-tick-15min') then
    perform cron.unschedule('tasks-tick-15min');
  end if;

  perform cron.schedule(
    'tasks-tick-15min',
    '*/15 * * * *',
    replace(sync_cmd, '/api/bosta/sync', '/api/tasks/recur')
  );
end $$;


-- ===== التأكيد: المفروض تشوف tasks-tick-15min في القايمة =====
select jobname, schedule, active from cron.job order by jobname;


-- ===== بعد ربع ساعة: اشتغلت ولا لأ؟ =====
--   select status, start_time, return_message
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'tasks-tick-15min')
--   order by start_time desc limit 5;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
--   select cron.unschedule('tasks-tick-15min');

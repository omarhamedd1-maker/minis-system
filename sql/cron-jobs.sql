-- ==========================================================================
-- المهام المجدولة — دي كانت متعملة في لوحة سوبابيز بس، فمحدش يقدر يعرف
-- المزامنة بتشتغل إمتى من قراءة الكود. اتسجّلت هنا عشان تبقى واضحة.
--
-- قاعدة البيانات بتنادي اللينك بنفسها باستخدام pg_cron + pg_net.
-- ==========================================================================

-- المهام الموجودة دلوقتي:
--
--   jobid  الاسم               التوقيت          شغالة
--   1      bosta-sync-15min    */15 * * * *     نعم    ← كل ١٥ دقيقة

-- عايز تشوف المهام الموجودة؟
--   select jobid, jobname, schedule, active, command from cron.job order by jobid;

-- عايز تشوف آخر مرات اشتغلت ونجحت ولا لأ؟
--   select jobid, status, start_time, return_message
--   from cron.job_run_details order by start_time desc limit 20;


-- ===== التحويل للمسار الجديد اللي جوّه المشروع =====
-- ده بيغيّر اللينك اللي المهمة بتناديه من دالة سوبابيز للمسار اللي في المشروع،
-- ومش بيلمس المفتاح ولا التوقيت — بيستبدل أول اللينك بس.
--
--   select cron.schedule(
--     'bosta-sync-15min',
--     '*/15 * * * *',
--     replace(
--       (select command from cron.job where jobname = 'bosta-sync-15min'),
--       'https://febtncfjywlneithefyi.supabase.co/functions/v1/bright-endpoint',
--       'https://minis-system.vercel.app/api/bosta/sync'
--     )
--   );

-- ===== الرجوع للدالة القديمة لو حصلت أي مشكلة =====
--
--   select cron.schedule(
--     'bosta-sync-15min',
--     '*/15 * * * *',
--     replace(
--       (select command from cron.job where jobname = 'bosta-sync-15min'),
--       'https://minis-system.vercel.app/api/bosta/sync',
--       'https://febtncfjywlneithefyi.supabase.co/functions/v1/bright-endpoint'
--     )
--   );

-- ===== إيقاف المزامنة مؤقتًا =====
--   select cron.unschedule('bosta-sync-15min');

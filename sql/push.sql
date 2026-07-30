-- ==========================================================================
-- إشعارات من السيستم نفسه على الموبايل (Web Push)
-- ==========================================================================
-- جدولين:
--
--   push_config         مفاتيح التوقيع (VAPID). صف واحد للمنصة كلها، لأن
--                       المفاتيح دي بتاعة التطبيق مش بتاعة البيزنس.
--                       **بتتولّد من جوّه السيستم بزرار** — عشان المفتاح
--                       السري مايعدّيش في شات ولا في متغيرات فيرسل.
--
--   push_subscriptions  الأجهزة المشتركة. الإشعار بيروح للجهاز نفسه مش
--                       للحساب، فكل واحد لازم يفعّلها من موبايله.
--
-- الاتنين مقفولين (RLS من غير أي قاعدة) — مفتاح الأدمن بس بيقرا ويكتب.
-- ==========================================================================

create table if not exists push_config (
  id smallint primary key default 1,
  vapid_public text not null,
  vapid_private text not null,
  created_at timestamptz not null default now(),
  -- صف واحد بس، مفيش تانى
  constraint push_config_single_row check (id = 1)
);

alter table push_config enable row level security;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  -- مين صاحب الجهاز — عشان لو المستخدم اتوقف نوقف إشعاراته
  auth_user_id uuid,
  user_name text,
  -- بوابة الجهاز عند المتصفح. مفتاح التفرّد الحقيقي
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- آخر مرة الإرسال نجح/فشل — الجهاز اللي بيفشل بيتشال لوحده
  last_ok_at timestamptz,
  failures smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create index if not exists push_subs_tenant
  on push_subscriptions (tenant_id);


-- ===== تأكيد =====
--   select vapid_public is not null as المفاتيح_موجودة from push_config;
--   select user_name, created_at, failures from push_subscriptions;


-- ==========================================================================
-- الرجوع
-- ==========================================================================
-- drop table if exists push_subscriptions;
-- drop table if exists push_config;

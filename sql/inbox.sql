-- ==========================================================================
-- صندوق الرسايل الموحّد — واتساب وإنستجرام وماسنجر في مكان واحد
-- --------------------------------------------------------------------------
-- كلام العميل كان متفرّق على تلات تطبيقات، ومحدش عارف مين رد على مين ولا
-- مين لسه مستني. والأهم: الكلام ده مالوش أي علاقة بالأوردر اللي بيتكلم
-- عنه — فاللي بيرد بيدوّر على الأوردر بإيده كل مرة.
--
-- ⚠️⚠️ **المنع الحقيقي للتكرار هنا قيد في الداتابيز مش شرط في الكود.**
-- ميتا بتبعت نفس الرسالة أكتر من مرة لما الرد بيتأخر أو يفشل (بتعيد
-- المحاولة لأيام). من غير القيد، رسالة العميل بتتكتب مرتين وتلاتة —
-- والمحادثة بتبقى غير مقروءة.
--
-- ⚠️ **والبيزنس في كل جدول** — الصندوق ده بيتقرا بمفتاح الأدمن (الويب هوك
-- مالهوش جلسة)، فالفلتر على البيزنس مسؤولية الكود، والقيود هنا بتحميه.
-- ==========================================================================

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- whatsapp · instagram · messenger
  channel text not null,

  -- معرّف الطرف التاني عند ميتا: رقم الواتساب، أو IGSID، أو PSID.
  -- ⚠️ **مش التليفون بالضرورة** — إنستجرام مابيديش تليفون خالص.
  external_id text not null,

  -- العميل اللي اتربط بيه. بيفضل فاضي لو مالقيناش حد بنفس الرقم —
  -- ومابنخترعش عميل من رسالة.
  customer_id uuid references customers(id) on delete set null,

  display_name text,

  last_message_at timestamptz,
  -- ⚠️ **آخر رسالة جاية من العميل** — نافذة الـ٢٤ ساعة بتتحسب منها،
  -- مش من آخر حركة في المحادثة.
  last_inbound_at timestamptz,

  unread integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),

  -- محادثة واحدة لكل طرف في كل قناة
  unique (tenant_id, channel, external_id)
);

create index if not exists conversations_tenant_recent
  on conversations (tenant_id, archived, last_message_at desc);

create index if not exists conversations_customer
  on conversations (tenant_id, customer_id);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null
    references conversations(id) on delete cascade,

  -- in = من العميل · out = مننا
  direction text not null,

  body text,
  attachment_url text,
  attachment_type text,

  -- معرّف الرسالة عند ميتا — ده اللي بيمنع التكرار
  external_id text,

  -- مين رد من عندنا (الاسم وقتها، مش مرجع — عشان يفضل مقروء بعد ما
  -- الموظف يمشي)
  sent_by_name text,

  -- sent · delivered · read · failed
  status text,
  error text,

  created_at timestamptz not null default now()
);

-- ⚠️⚠️ **ده الحاجز**: ميتا بتعيد إرسال نفس الرسالة، والقيد بيرفض التاني.
-- جزئي عشان الرسايل اللي إحنا بنبعتها ولسه مالهاش معرّف ماتتمنعش.
create unique index if not exists conversation_messages_once
  on conversation_messages (tenant_id, external_id)
  where external_id is not null;

create index if not exists conversation_messages_thread
  on conversation_messages (conversation_id, created_at);

-- حسابات ميتا بتاعت البيزنس — نفس مكان باقي المفاتيح، مقفول على السيرفر
--
-- ⚠️⚠️ **سرّ التطبيق وتوكن التحقق مش هنا بقصد.** التطبيق عند ميتا **واحد
-- للسيستم كله**، وكل بيزنس بيوصّل صفحته وحسابه بيه — فالسرّ ده بتاع
-- السيستم مش بتاع البيزنس، ومكانه متغيّرات البيئة
-- (`META_APP_SECRET` و`META_VERIFY_TOKEN`). لو اتحط هنا يبقى كل بيزنس
-- محتاج تطبيق لوحده عند ميتا، وده مش تركيب يمشي.
--
-- اللي هنا هو **معرّفات البيزنس نفسه** — بيها بنعرف الرسالة الجاية تخص مين.
--
-- ⚠️ **والرقم مش لازم يسيب تطبيق واتساب.** ميتا طرحت Coexistence (مايو
-- ٢٠٢٥): نفس الرقم بيفضل على تطبيق **واتساب بيزنس** وبيتوصّل بالـCloud API
-- مع بعض، والمزامنة في الاتجاهين لحظيًا. شروطها: تطبيق واتساب بيزنس
-- ٢٫٢٤٫١٧ أو أحدث، ويتفتح مرة كل ١٣ يوم، والجروبات مابتتزامنش.
alter table tenant_credentials
  add column if not exists meta_page_token text,
  add column if not exists meta_page_id text,
  add column if not exists whatsapp_phone_id text,
  add column if not exists whatsapp_token text,
  add column if not exists instagram_account_id text;

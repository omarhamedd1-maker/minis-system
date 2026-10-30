-- ==========================================================================
-- فكّ الشحنات القديمة اللي اتربطت غلط بأوردرات جديدة — ٢ سِك
-- --------------------------------------------------------------------------
-- المطابقة بالتليفون كانت بتربط شحنة قديمة بلا مرجع بأول أوردر جديد لنفس
-- العميل. النتيجة: الأوردر بيتولد وهو «رجع ومتسلمش» أو «تم التسليم».
--
-- ⚠️⚠️ **شغّل ده بعد ما الإصلاح يتنشر على فيرسل، مش قبله.**
-- المزامنة بتلف كل ١٥ دقيقة — لو فككت الربط والكود القديم لسه شغّال،
-- هيرجع يربطهم تاني في أول لفة.
--
-- الأربعة دول مش مربوطين بأي تحويل ولا اتاخدت فلوسهم (`cash_received_at`
-- فاضي في الأربعة)، فالفك مابيحركش فلوس متصالحة.
--
--   #1577 | أوردر ٢٩ أكتوبر ← شحنة ١١ فبراير (فرق ٢٦١ يوم) | تحصيلنا ٣٬٦٨٠ وبوسطة ٠
--   #1582 | أوردر ٣٠ أكتوبر ← شحنة ٢٥ فبراير (فرق ٢٤٧ يوم) | تحصيلنا ٧٧٠ وبوسطة ٦٦٠
--   #1280 | أوردر ٩ يوليو  ← شحنة ٢٩ مارس  (فرق ١٠٢ يوم)
--   #1310 | أوردر ١٨ يوليو ← شحنة ١٩ مايو   (فرق ٦٠ يوم)
-- ==========================================================================

-- ===== ١) شوف الحالة قبل التنفيذ =====
select order_number, order_status, order_date::date, bosta_tracking,
       bosta_created_at::date, bosta_state, bosta_cod, bosta_collected,
       delivered_at::date, cash_received_at
from orders
where tenant_id = 'f2833051-6e44-4393-9878-21406986b657'
  and order_number in ('1280', '1310', '1577', '1582')
order by order_number;

-- ===== ٢) فك الربط =====
-- الشحنة بترجع «مش مربوطة» عند بوسطة، وده الصح — دي شحنات اتعملت من
-- لوحة بوسطة من غير مرجع ومالهاش أوردر عندنا أصلاً.
update orders set
  bosta_tracking      = null,
  bosta_state         = null,
  bosta_cod           = 0,
  bosta_collected     = false,
  bosta_created_at    = null,
  bosta_shipping_cost = null,
  bosta_exception     = null,
  cod_alerted_diff    = null,
  delivered_at        = null
where tenant_id = 'f2833051-6e44-4393-9878-21406986b657'
  and order_number in ('1280', '1310', '1577', '1582');

-- ===== ٣) رجّع الحالة للي المزامنة غيّرتها =====
-- بس الاتنين دول — سجل النشاط مثبّت إن المزامنة هي اللي غيّرتهم:
--   «حالة أوردر 1577 بقت رجع ومتسلمش (كانت جديد)» ثم «(كانت مؤكد)»
--   «حالة أوردر 1582 بقت تم التسليم (كانت جديد)»
-- ١٥٧٧ بيرجع «مؤكد» لأن السجل بيقول إن حد أكّده بإيده بين اللفتين،
-- و١٥٨٢ بيرجع «جديد».
update orders set order_status = 'confirmed'
where tenant_id = 'f2833051-6e44-4393-9878-21406986b657' and order_number = '1577';

update orders set order_status = 'new'
where tenant_id = 'f2833051-6e44-4393-9878-21406986b657' and order_number = '1582';

-- ⚠️ #1280 و#1310 حالتهم **ما تتلمسش**: مفيش سطر في سجل النشاط بيقول إن
-- المزامنة غيّرتهم، يعني الحالة جاية من شوبيفاي مش من الربط الغلط.

-- ===== ٤) اتأكد =====
select order_number, order_status, bosta_tracking, bosta_state, bosta_cod
from orders
where tenant_id = 'f2833051-6e44-4393-9878-21406986b657'
  and order_number in ('1280', '1310', '1577', '1582')
order by order_number;

-- ==========================================================================
-- التراجع — لو حصل أي حاجة مش متوقعة، ده بيرجّع كل حاجة زي ماكانت بالظبط
-- ==========================================================================
-- update orders set bosta_tracking='44638627', bosta_state='Returned to business',
--   bosta_cod=0, bosta_collected=false, bosta_created_at='2026-02-11T00:54:24+00',
--   bosta_shipping_cost=22.8, cod_alerted_diff=-3680, delivered_at=null,
--   bosta_exception='Waiting for data modification - address not clear (١٦ فبراير) — 3 محاولات — اتجدولت ١٧ فبراير',
--   order_status='returned'
-- where tenant_id='f2833051-6e44-4393-9878-21406986b657' and order_number='1577';
--
-- update orders set bosta_tracking='82930382', bosta_state='Delivered',
--   bosta_cod=660, bosta_collected=true, bosta_created_at='2026-02-25T22:03:06+00',
--   bosta_shipping_cost=34.2, cod_alerted_diff=-110,
--   delivered_at='2026-10-30T15:30:08.975+00',
--   bosta_exception='العميل طلب التأجيل (١ مارس) — اتجدولت ٢ مارس',
--   order_status='delivered'
-- where tenant_id='f2833051-6e44-4393-9878-21406986b657' and order_number='1582';
--
-- update orders set bosta_tracking='55141837', bosta_state='Delivered',
--   bosta_cod=530, bosta_collected=true, bosta_created_at='2026-03-29T08:57:35+00',
--   bosta_shipping_cost=26.22, delivered_at='2026-07-09T09:02:10+00'
-- where tenant_id='f2833051-6e44-4393-9878-21406986b657' and order_number='1280';
--
-- update orders set bosta_tracking='6375888706', bosta_state='Returned to business',
--   bosta_cod=0, bosta_collected=false, bosta_created_at='2026-05-19T10:53:42+00',
--   bosta_shipping_cost=11.4, delivered_at=null,
--   bosta_exception='العميل رفض يستلم (٢٠ مايو)'
-- where tenant_id='f2833051-6e44-4393-9878-21406986b657' and order_number='1310';

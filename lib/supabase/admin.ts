import { createClient } from "@supabase/supabase-js";

// عميل Supabase بصلاحية كاملة (service role) — بيتجاوز RLS.
// يُستخدم في السيرفر فقط (server actions / route handlers) وبعد التأكد من صلاحية المستخدم.
// ممنوع استيراده في أي كومبوننت بيشتغل في المتصفح.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "مفتاح الأدمن ناقص — ضيف SUPABASE_SERVICE_ROLE_KEY في إعدادات السيرفر"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

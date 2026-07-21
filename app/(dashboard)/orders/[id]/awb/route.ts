import { createClient } from "@/lib/supabase/server";

// بوليصة الشحن (AWB): بنجيبها من دالة بوسطة بالمفتاح السري (سيرفر) ونرجّعها PDF
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const key = process.env.SYNC_KEY;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !base) {
    return new Response("إعدادات ناقصة", { status: 500 });
  }

  const res = await fetch(
    `${base}/functions/v1/bosta-awb?key=${key}&order=${id}`
  );
  if (!res.ok) {
    return new Response(await res.text(), { status: res.status });
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=awb.pdf",
    },
  });
}

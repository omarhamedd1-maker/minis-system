import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, getSessionUser } from "@/lib/permissions";
import { runBostaAwb } from "@/lib/bosta/awb";

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

  const sessionUser = await getSessionUser();
  if (!can(sessionUser, "ship.print")) {
    return new Response("مالكش صلاحية طباعة البوالص", { status: 403 });
  }

  const res = await runBostaAwb({ db: createAdminClient(), orderId: id });
  if (!res.ok) {
    return new Response(res.error, { status: res.status });
  }

  return new Response(res.pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=awb.pdf",
    },
  });
}

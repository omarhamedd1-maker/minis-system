import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { readPublicKey } from "@/lib/push/send";

/**
 * المفتاح العام — المتصفح محتاجه عشان يعمل الاشتراك.
 * مفيش مشكلة إنه ظاهر، ده الغرض منه. والسري مابيطلعش من السيرفر خالص.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const key = await readPublicKey(createAdminClient());
  if (!key) {
    return Response.json(
      { ok: false, error: "الإشعارات لسه مش مظبوطة — شغّل sql/push.sql" },
      { status: 503 }
    );
  }
  return Response.json({ ok: true, key });
}

/**
 * بيحفظ جهاز جديد.
 * الإشعار بيروح للجهاز مش للحساب، فكل واحد لازم يفعّلها من موبايله —
 * وبنسجّل اسمه عشان تعرف مين مفعّل ومين لأ.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "بيانات مش مفهومة" }, { status: 400 });
  }

  const endpoint = String(body?.endpoint ?? "");
  const p256dh = String(body?.keys?.p256dh ?? "");
  const auth = String(body?.keys?.auth ?? "");

  if (!endpoint || !p256dh || !auth) {
    return Response.json(
      { ok: false, error: "الاشتراك ناقص" },
      { status: 400 }
    );
  }

  // نفس الجهاز يتحدّث مش يتكرر — البوابة هي مفتاح التفرّد
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        tenant_id: user.tenantId,
        auth_user_id: user.authUserId,
        user_name: user.fullName ?? user.email ?? null,
        endpoint,
        p256dh,
        auth,
        failures: 0,
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    return Response.json(
      {
        ok: false,
        error: error.message + " — لو الجداول لسه مااتعملتش شغّل sql/push.sql",
      },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}

/** بيشيل الجهاز لما المستخدم يقفل الإشعارات */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");
  if (!endpoint) {
    return Response.json({ ok: false, error: "مفيش جهاز" }, { status: 400 });
  }

  // الجهاز بتاع بيزنس المستخدم بس — العنوان لوحده كفاية عمليًا لأنه فريد،
  // بس الفلتر بيمنع إن حد يشيل جهاز من بيزنس تاني لو عرف عنوانه
  await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("tenant_id", user.tenantId)
    .eq("endpoint", endpoint);

  return Response.json({ ok: true });
}

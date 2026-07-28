import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // مسارات api/ مستثناة: دي بتتنادى من أنظمة تانية (المزامنة المجدولة مثلاً)
    // ومالهاش جلسة دخول — كل واحدة فيهم بتحمي نفسها بمفتاحها.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

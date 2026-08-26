import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith("/login");
  // **شاشة التسجيل لازم تفتح من غير حساب** — دي المكان اللي العميل بيعمل
  // فيه بيزنسه بنفسه، ولو اتقفلت بالبوابة محدش هيوصلها أصلًا.
  const isSignupPage = pathname.startsWith("/signup");
  // ⚠️⚠️ **صفحة تتبع الشحنة للعميل** — العميل مالوش حساب عندنا أصلًا،
  // فالبوابة هنا كانت بتحوّله على `/login` واللينك اللي بنبعتهوله
  // مايفتحش. الصفحة نفسها بتوري الحالة وبس، والتفاصيل ورا تليفون الأوردر.
  const isTrackPage = pathname.startsWith("/track/");
  // ⚠️ **وصفحة الطلب المباشر** — اللينك بيتبعت للعميل في رسالة، والعميل
  // مالوش حساب. لو البوابة حوّلته على الدخول، اللينك مالوش لازمة أصلًا.
  const isOrderLink = pathname.startsWith("/o/");
  // ⚠️ **وصفحة التقييم** — نفس السبب: العميل مالوش حساب، وأي تسجيل دخول
  // معناه صفر تقييمات.
  const isRatingPage = pathname.startsWith("/r/");
  // مسارات عامة: تعريف البرنامج وأيقوناته لازم تفتح من غير تسجيل دخول
  const isPublic =
    isLoginPage ||
    isSignupPage ||
    isTrackPage ||
    isOrderLink ||
    isRatingPage ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon" ||
    pathname === "/apple-icon";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // اللي داخل خلاص مالوش لازمة في الدخول ولا التسجيل
  if (user && (isLoginPage || isSignupPage)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

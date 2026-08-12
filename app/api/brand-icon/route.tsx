import { ImageResponse } from "next/og";

/**
 * أيقونة التطبيق بمقاس شوبيفاي — **1200×1200**.
 *
 * نفس أيقونة الموقع بالظبط (حرف G في دايرة)، بس بالمقاس اللي شوبيفاي
 * بتطلبه لصفحة التطبيق. `app/icon.tsx` بتطلّع 512 وهي للمتصفح.
 *
 * **بتتفتح وتتحفظ بالإيد** — مش صورة في المشروع، عشان تفضل مبنية من نفس
 * الكود اللي بيبني أيقونة الموقع. لو الشكل اتغيّر يوم، الاتنين بيتغيّروا مع
 * بعض ومحدش بينسى واحدة.
 *
 *   افتح /api/brand-icon ← احفظ الصورة ← ارفعها في صفحة التطبيق
 */
export const contentType = "image/png";

const SIZE = 1200;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // **مربع مش دايرة** — شوبيفاي بتقص الزوايا بنفسها، ولو بعتنالها
          // دايرة بتطلع مقصوصة مرتين
          background: "#f9fafb",
          color: "#171717",
          fontSize: 700,
          fontWeight: 100,
        }}
      >
        G
      </div>
    ),
    { width: SIZE, height: SIZE }
  );
}

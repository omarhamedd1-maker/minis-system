import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// أيقونة البرنامج (المتصفح): دايرة سودا وفيها حرف M رفيع باللون الرمادي الفاتح بتاعنا
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f9fafb",
          borderRadius: "50%",
          color: "#171717",
          fontSize: 300,
          fontWeight: 100,
        }}
      >
        M
      </div>
    ),
    { ...size }
  );
}

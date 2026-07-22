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
          background: "#171717",
          borderRadius: "50%",
          color: "#e5e4e1",
          fontSize: 300,
          fontWeight: 200,
        }}
      >
        M
      </div>
    ),
    { ...size }
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// أيقونة الآيفون (تظهر على الشاشة الرئيسية)
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#efeeec",
          color: "#171717",
          fontSize: 46,
          fontWeight: 300,
          letterSpacing: 6,
          paddingLeft: 6,
        }}
      >
        MINIS
      </div>
    ),
    { ...size }
  );
}

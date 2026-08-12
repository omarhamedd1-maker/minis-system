import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// أيقونة الآيفون (تظهر على الشاشة الرئيسية): خلفية سودا وحرف G رفيع رمادي فاتح
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
          background: "#f9fafb",
          color: "#171717",
          fontSize: 108,
          fontWeight: 100,
        }}
      >
        G
      </div>
    ),
    { ...size }
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// أيقونة البرنامج: شعار MINIS على خلفية فاتحة
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
          background: "#efeeec",
          color: "#171717",
          fontSize: 132,
          fontWeight: 300,
          letterSpacing: 18,
          // إزاحة بسيطة عشان التباعد بيزيح النص لليسار
          paddingLeft: 18,
        }}
      >
        MINIS
      </div>
    ),
    { ...size }
  );
}

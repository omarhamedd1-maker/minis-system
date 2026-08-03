import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // **الاسم ده هو اللي بيتكتب تحت الإشعار على الموبايل** — النظام بياخده
    // من هنا مش من الكود. كان "Minis System" فكل إشعار بيجي وتحته السطر ده،
    // فبقى بالعربي زي باقي السيستم.
    name: "مينيز",
    short_name: "مينيز",
    description: "نظام إدارة تشغيل مينيز",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#f9fafb",
    lang: "ar",
    dir: "rtl",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

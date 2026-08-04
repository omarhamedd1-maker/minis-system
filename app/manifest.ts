import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // **الاسم ده هو اللي الآيفون بيكتبه في سطر `from` جوّه الإشعار**، وهو
    // كمان اللي بيبان تحت الأيقونة على الشاشة الرئيسية.
    //
    // كان "Minis System" فالسطر بيطلع `from Minis System` — طويل وبياخد
    // سطر كامل من إشعار قصير. بقى "MINIS" فبيطلع `from MINIS`.
    //
    // ⚠️ **والسطر ده مايتشالش** — آبل بتفرضه على أي إشعار من موقع وبتحطه
    // بين العنوان والجسم، ومفيش أي إعداد يغيّر مكانه. أقصى اللي نقدر عليه
    // إن الاسم يبقى قصير.
    name: "MINIS",
    short_name: "MINIS",
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

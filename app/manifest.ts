import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Minis System",
    short_name: "Minis",
    description: "نظام إدارة تشغيل Minis",
    start_url: "/",
    display: "standalone",
    background_color: "#efeeec",
    theme_color: "#efeeec",
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

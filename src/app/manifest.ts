import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { squadConfig } from "@/config/squad";

// Web app manifest: lets the squad add the app to their Home Screen (needed on
// iPhone for push notifications) and open it full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: squadConfig.shortName,
    description: siteConfig.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef1fb",
    theme_color: "#eef1fb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

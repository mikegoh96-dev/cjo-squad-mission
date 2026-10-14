import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ArtDefs } from "@/components/art/art-defs";
import { SplashScreen } from "@/components/splash-screen";
import { siteConfig } from "@/config/site";
import "./globals.css";

// Geometric, rounded and bold at large sizes: playful but professional.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  // Installable to the Home Screen (required on iPhone for push notifications).
  appleWebApp: { capable: true, title: "CJO Squad", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d17" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col font-sans text-foreground">
        <ArtDefs />
        <SplashScreen />
        {/* Without JavaScript the splash would never close. */}
        <noscript>
          <style>{".splash{display:none}"}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}

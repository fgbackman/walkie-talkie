import type { Metadata, Viewport } from "next";
import "./globals.css";

// Every page renders per request so it can carry that request's CSP nonce
// (set in middleware). A prerendered page would ship scripts with no nonce,
// which the policy blocks.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Walkie Talkie", template: "%s · Walkie Talkie" },
  description:
    "Drop-in audio rooms for people who are already walking. Live rooms, GPS tracking, and a feed built on what you actually care about.",
  applicationName: "Walkie Talkie",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Walkie Talkie", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9e8e0" },
    { media: "(prefers-color-scheme: dark)", color: "#171a14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=DM+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

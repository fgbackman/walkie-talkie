import type { Metadata, Viewport } from "next";
import { Archivo, DM_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

// Downloaded at build time and served from our own origin, so visitors'
// browsers never contact Google (no IP or referrer sent to a third party).
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${archivo.variable} ${publicSans.variable} ${dmMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}

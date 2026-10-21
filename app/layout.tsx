import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./terrace.css";
import "./reports.css";
export const metadata: Metadata = {
  title: "Keuangan — Garda Abdi Negara",
  description: "Dashboard keuangan bimbingan belajar Garda Abdi Negara.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f6f0",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script src="/appearance.js" />
        <link rel="stylesheet" href="/terrace-base.css" />
      </head>
      <body data-theme="terrace">
        {children}
      </body>
    </html>
  );
}

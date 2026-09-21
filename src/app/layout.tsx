import type { Metadata, Viewport } from "next";
import { Fira_Sans, Fira_Sans_Extra_Condensed } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const sans = Fira_Sans({
  subsets: ["cyrillic", "cyrillic-ext", "latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-src",
  display: "swap",
});

const cond = Fira_Sans_Extra_Condensed({
  subsets: ["cyrillic", "cyrillic-ext", "latin", "latin-ext"],
  weight: ["500", "700"],
  variable: "--font-cond-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Команда",
  description: "Склад і розклад волейбольної команди",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Telegram-скрипт дописує style на <html> до гідратації — це очікувано.
    <html lang="uk" className={`${sans.variable} ${cond.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js?59" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

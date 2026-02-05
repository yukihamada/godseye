import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { JsonLd } from "@/components/JsonLd";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://godseye-web.fly.dev";
const siteName = "God's Eye";
const siteDescription =
  "AIと政府オープンデータを活用した建物地震倒壊リスク診断システム。PLATEAU 3D都市モデル、J-SHIS地盤情報、Google Street View、衛星画像を統合し、機械学習で倒壊確率を予測します。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — 地震倒壊リスク診断`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    "地震",
    "倒壊リスク",
    "建物診断",
    "PLATEAU",
    "J-SHIS",
    "AI",
    "機械学習",
    "防災",
    "耐震",
    "3D都市モデル",
    "オープンデータ",
    "Street View",
    "衛星画像",
  ],
  authors: [{ name: "God's Eye Team" }],
  creator: "God's Eye",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: siteUrl,
    siteName,
    title: `${siteName} — AIによる建物地震倒壊リスク診断`,
    description: siteDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "God's Eye - AIによる建物地震倒壊リスク診断システム",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} — 地震倒壊リスク診断`,
    description: siteDescription,
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        <JsonLd />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

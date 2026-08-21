import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import { LOCALES } from "@/lib/i18n";

const baseUrl = "https://noiraxplum.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "NOIRAX — Autonomous Crypto Trading Signals",
    template: "%s — NOIRAX",
  },
  description:
    "Educational crypto trading signals with technical and fundamental analysis. Multi-coin, multi-timeframe. Autonomous system, not financial advice.",
  verification: {
    google: "PyRhES3aFljMguuoe1TAXD89v6MFcDMZYHLRcpzsQwU",
  },
  metadataBase: new URL(baseUrl),
  alternates: {
    canonical: baseUrl,
    languages: Object.fromEntries(
      LOCALES.map((l) => [l === "en" ? "x-default" : l, `${baseUrl}/${l === "en" ? "" : l}`])
    ),
  },
  openGraph: {
    title: "NOIRAX — Autonomous Crypto Trading Signals",
    description: "Multi-coin crypto trading signals with technical + fundamental analysis. Educational.",
    siteName: "NOIRAX",
    url: baseUrl,
    type: "website",
    locale: "en_US",
    images: [{ url: `${baseUrl}/og.png`, width: 1200, height: 630 }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="google-site-verification" content="PyRhES3aFljMguuoe1TAXD89v6MFcDMZYHLRcpzsQwU" />
      </head>
      <body className="min-h-full flex flex-col bg-black text-foreground font-sans antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

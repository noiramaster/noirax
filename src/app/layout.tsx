import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "NOIRAX — Autonomous Crypto Trading Signals",
  description:
    "Sistema autónomo de señales de trading cripto con análisis técnico multi-moneda. Contenido educativo e informativo.",
  verification: {
    google: "PyRhES3aFljMguuoe1TAXD89v6MFcDMZYHLRcpzsQwU",
  },
  openGraph: {
    title: "NOIRAX — Autonomous Crypto Trading Signals",
    description: "Sistema autónomo de señales de trading cripto con análisis técnico multi-moneda.",
    siteName: "NOIRAX",
    url: "https://noirax-plum.vercel.app",
    type: "website",
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

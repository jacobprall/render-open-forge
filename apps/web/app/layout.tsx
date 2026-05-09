import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import { RouteProgress } from "@/components/layout/route-progress";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OpenForge",
    template: "%s | OpenForge",
  },
  description: "Self-hosted agentic forge",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen bg-surface-0 font-sans text-text-primary antialiased">
        <RouteProgress />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}

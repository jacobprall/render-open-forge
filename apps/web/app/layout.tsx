import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { RouteProgress } from "@/components/layout/route-progress";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        <RouteProgress />
        {children}
      </body>
    </html>
  );
}

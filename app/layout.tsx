import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/ui/Nav";
import { AiStatusBanner } from "@/components/ui/AiStatusBanner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trading Assistant",
  description: "AI-powered personal stock and options trading assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full bg-zinc-950 text-white antialiased">
        <Nav />
        <AiStatusBanner />
        <main className="min-h-[calc(100vh-49px)]">
          {children}
        </main>
      </body>
    </html>
  );
}

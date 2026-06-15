import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

// Clean grotesque for UI + a high-contrast serif for the italic display accent
// (matches the marketing template's headline treatment).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Inteloop — Competitor intelligence, delivered weekly",
  description:
    "Inteloop tracks your competitors and emails you a sharp intelligence briefing every Monday — what changed, why it matters, and what to watch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="bg-[#fffaf5] font-sans text-neutral-900 antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inteloop",
  description: "Competitor intelligence, delivered weekly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

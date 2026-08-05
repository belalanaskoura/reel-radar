import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  variable: "--font-marquee",
  weight: "400",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReelAlert",
  description: "Watchlist upcoming movies at Scene Cinemas and get notified the moment tickets go live.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable}`}>
      <body className="min-h-screen font-[family-name:var(--font-body)] antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}

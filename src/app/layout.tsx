import type { Metadata } from "next";
import Script from "next/script";
import { Bebas_Neue, Inter } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { SearchProvider } from "@/components/SearchProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageTransition } from "@/components/PageTransition";
import "./globals.css";

// Runs before first paint (a plain <script>, not a React effect) so the
// stored theme preference applies immediately -- without this, the page
// would always paint in the OS-default theme first, then flash to the
// user's actual saved preference once ThemeProvider's effect ran.
const NO_FLASH_THEME_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('reelradar:theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;

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
  title: "ReelRadar",
  description: "Browse what's bookable and coming soon at Scene Cinemas, and get notified the moment tickets go live.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ReelRadar",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <Script id="no-flash-theme" strategy="beforeInteractive">
          {NO_FLASH_THEME_SCRIPT}
        </Script>
      </head>
      <body className="min-h-screen font-[family-name:var(--font-body)] antialiased">
        <ThemeProvider>
          <SearchProvider>
            <NavBar />
            <PageTransition>{children}</PageTransition>
          </SearchProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

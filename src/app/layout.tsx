import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bebas_Neue, Inter } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { SearchProvider } from "@/components/SearchProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageTransition } from "@/components/PageTransition";
import { PushPrompt } from "@/components/PushPrompt";
import { ProductUpdates } from "@/components/ProductUpdates";
import { createClient } from "@/lib/supabase/server";
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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://reelradar.online";
const SITE_DESCRIPTION =
  "Browse what's bookable and coming soon at Cairo cinemas, and get notified the moment tickets go live.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ReelRadar",
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ReelRadar",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "ReelRadar",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "ReelRadar",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only worth checking push state for a signed-in user -- an anonymous
  // visitor has nowhere to save a subscription against anyway.
  let showPushPrompt = false;
  if (user) {
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);
    showPushPrompt = !subscriptions || subscriptions.length === 0;
  }

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
            {showPushPrompt ? <PushPrompt /> : user ? <ProductUpdates /> : null}
          </SearchProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

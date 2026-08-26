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

  // Every route renders inside this layout, including /signin and
  // /signup -- before this try/catch existed, a Supabase Auth network
  // failure here (not just a bad/expired session, which the client
  // already handles internally by returning user: null) threw straight
  // past this component, crashing the entire site for every visitor,
  // signed in or not, with no way to even reach the sign-in page to
  // retry. Falling back to signed-out is safe: the app is fully
  // browsable anonymously, and every child component already treats
  // user: null as the anonymous case.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    console.error('RootLayout: getUser() failed, rendering as signed out', err);
  }

  // Only worth checking push state for a signed-in user -- an anonymous
  // visitor has nowhere to save a subscription against anyway.
  let showPushPrompt = false;
  if (user) {
    try {
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      showPushPrompt = !subscriptions || subscriptions.length === 0;
    } catch (err) {
      // Same reasoning as the getUser() catch above -- a failed check
      // here shouldn't crash the site either, it just means the push
      // prompt doesn't show this load.
      console.error('RootLayout: push_subscriptions check failed', err);
    }
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

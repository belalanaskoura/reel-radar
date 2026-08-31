import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Poppins, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { NavBar } from "@/components/NavBar";
import { SearchProvider } from "@/components/SearchProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageTransition } from "@/components/PageTransition";
import { PushPrompt } from "@/components/PushPrompt";
import { ProductUpdates } from "@/components/ProductUpdates";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/logger";
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

// Curve Retro -- a single-weight retro display face, commercially
// licensed for this app (confirmed by the user; 1001fonts FFP license
// bundled with the download is personal-use-only on its own). Replaces
// Athelas as the brand's display voice: headlines, wordmark, movie
// titles. One weight, no italic -- accent treatment uses color, not a
// faux-italic/faux-bold the font file doesn't actually provide.
const curveRetro = localFont({
  src: "../fonts/CurveRetro-Regular.ttf",
  variable: "--font-marquee",
  weight: "400",
  display: "swap",
});

// Poppins -- a geometric grotesk (SIL OFL, free for commercial use),
// replacing Athelas as the body/UI voice everywhere .font-display isn't
// used. Loaded via next/font/google (Poppins is a real Google Fonts
// family) rather than the local .ttf files in the project's poppins.zip,
// for automatic subsetting/self-hosting with no extra local font files
// to maintain -- same visual result, less to carry in the repo.
const poppins = Poppins({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// Space Grotesk -- a geometric grotesk with more character than Poppins
// (SIL OFL, free for commercial use; the project's space-grotesk.zip is
// the same real Google Fonts family, loaded here via next/font/google
// instead for the same reason Poppins is). Used only for section
// sub-headings on the landing page ("Trending in Cairo" and its trending
// movie card titles) -- a distinct voice between Curve Retro's big
// display headlines and Poppins' body/UI text, not a site-wide swap.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-subhead",
  weight: ["500", "700"],
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
    logError('auth', err, { where: 'RootLayout.getUser' });
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
      logError('auth', err, { where: 'RootLayout.push_subscriptions', userId: user.id });
    }
  }

  return (
    <html lang="en" className={`${curveRetro.variable} ${poppins.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
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

import type { Browser } from 'playwright-core';

// Version must match the installed @sparticuz/chromium-min package version
// (see package.json) -- the hosted pack and the npm package are versioned
// together and must agree. Same pattern the since-deleted scrape-vox-slugs
// route used.
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

// Local dev has the full `playwright` package (devDependency, bundles real
// Chromium) available and VERCEL is unset; production Vercel functions only
// ship `playwright-core` + `@sparticuz/chromium-min` (see package.json --
// full playwright is intentionally dev-only, it's too large to ship in a
// serverless function). Both expose the same launch()-returning Browser
// type from playwright-core, so callers don't need to know which path ran.
export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const { chromium } = await import('playwright-core');
    const chromiumBinary = (await import('@sparticuz/chromium-min')).default;
    return chromium.launch({
      args: chromiumBinary.args,
      executablePath: await chromiumBinary.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });
  }

  const { chromium } = await import('playwright');
  // playwright's Browser type is structurally identical to playwright-core's
  // (playwright re-exports playwright-core's implementation) -- safe to
  // treat as the same type here so callers only ever import from
  // playwright-core, which is the one guaranteed to exist at build time in
  // production (see package.json: full playwright is dev-only).
  return chromium.launch({ headless: true }) as unknown as Browser;
}

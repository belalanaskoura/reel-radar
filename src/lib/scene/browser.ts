import type { Browser } from 'playwright-core';

// Version must match the installed @sparticuz/chromium-min package version
// (see package.json) -- the hosted pack and the npm package are versioned
// together and must agree. Same pattern the since-deleted scrape-vox-slugs
// route used.
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

export interface BrowserLaunchTiming {
  // executablePath() downloads @sparticuz/chromium-min's ~66MB binary
  // pack from GitHub's release CDN and extracts it, on every cold
  // invocation (nothing on Vercel's /tmp persists between them) -- a
  // real network+disk cost, separate from actually starting the browser
  // process. Split out from chromium.launch()'s own time so a slow
  // launchMs can be attributed to the right cause instead of guessed at.
  resolveExecutableMs: number;
  launchProcessMs: number;
}

// Local dev has the full `playwright` package (devDependency, bundles real
// Chromium) available and VERCEL is unset; production Vercel functions only
// ship `playwright-core` + `@sparticuz/chromium-min` (see package.json --
// full playwright is intentionally dev-only, it's too large to ship in a
// serverless function). Both expose the same launch()-returning Browser
// type from playwright-core, so callers don't need to know which path ran.
export async function launchBrowser(): Promise<{ browser: Browser; timing: BrowserLaunchTiming }> {
  if (process.env.VERCEL) {
    const { chromium } = await import('playwright-core');
    const chromiumBinary = (await import('@sparticuz/chromium-min')).default;

    const resolveStart = Date.now();
    const executablePath = await chromiumBinary.executablePath(CHROMIUM_PACK_URL);
    const resolveExecutableMs = Date.now() - resolveStart;

    const launchStart = Date.now();
    const browser = await chromium.launch({
      args: chromiumBinary.args,
      executablePath,
      headless: true,
    });
    const launchProcessMs = Date.now() - launchStart;

    return { browser, timing: { resolveExecutableMs, launchProcessMs } };
  }

  const { chromium } = await import('playwright');
  const launchStart = Date.now();
  // playwright's Browser type is structurally identical to playwright-core's
  // (playwright re-exports playwright-core's implementation) -- safe to
  // treat as the same type here so callers only ever import from
  // playwright-core, which is the one guaranteed to exist at build time in
  // production (see package.json: full playwright is dev-only).
  const browser = chromium.launch({ headless: true }) as unknown as Browser;
  return {
    browser: await browser,
    timing: { resolveExecutableMs: 0, launchProcessMs: Date.now() - launchStart },
  };
}

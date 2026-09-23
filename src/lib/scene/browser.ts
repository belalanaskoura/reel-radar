import type { Browser } from 'playwright-core';

// Version must match the installed @sparticuz/chromium-min package version
// (see package.json) -- the hosted pack and the npm package are versioned
// together and must agree. Same pattern the since-deleted scrape-vox-slugs
// route used.
//
// Real production timing (2026-09-23, via seat_plan_fetch's
// resolveExecutableMs) showed this GitHub-hosted download alone taking
// ~3s of every cold invocation's ~3.6s launch cost -- downloading the
// same ~66MB file from GitHub's release CDN on every single cold start,
// since nothing on Vercel's /tmp persists between them. chromium-min's
// own docs recommend self-hosting the pack somewhere fast and close to
// the function's execution region instead of pointing at GitHub directly
// ("a location on S3 or another very fast downloadable location that is
// close to your function's execution environment"). CHROMIUM_PACK_URL
// env var overrides this default when set (a Vercel Blob store created
// in iad1, matching every Scene-facing route's pinned region in
// vercel.json) -- falls back to the original GitHub URL when unset so
// this keeps working before/without that env var being configured.
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
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
  // Whether CHROMIUM_PACK_URL was actually set at runtime (i.e. the
  // self-hosted Blob copy was used) vs. silently falling back to the
  // GitHub default -- added after a real deploy showed no improvement in
  // resolveExecutableMs despite the env var supposedly being configured,
  // to tell "the env var isn't being read" apart from "the Blob copy
  // isn't actually faster than GitHub" without guessing.
  usedCustomPackUrl: boolean;
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

    return {
      browser,
      timing: {
        resolveExecutableMs,
        launchProcessMs,
        usedCustomPackUrl: !!process.env.CHROMIUM_PACK_URL,
      },
    };
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
    timing: {
      resolveExecutableMs: 0,
      launchProcessMs: Date.now() - launchStart,
      usedCustomPackUrl: false,
    },
  };
}

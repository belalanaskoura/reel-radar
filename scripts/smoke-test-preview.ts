/**
 * Real page-load check against a live Vercel Preview deployment, run by
 * .github/workflows/preview-smoke.yml once Vercel's own GitHub integration
 * reports that deployment successful. Deliberately small: two routes, no
 * auth, no full E2E flow -- this exists to catch "the deploy is up but the
 * page actually crashes", not to replace real testing.
 *
 * Run with `npx tsx scripts/smoke-test-preview.ts`, PREVIEW_URL set to the
 * deployment's base URL.
 */
import { chromium } from 'playwright';

const baseUrl = process.env.PREVIEW_URL;
if (!baseUrl) {
  console.error('PREVIEW_URL not set');
  process.exit(1);
}

const routes = ['/', '/browse'];

async function main() {
  const browser = await chromium.launch();
  let failed = false;

  for (const route of routes) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    const status = response ? response.status() : 0;

    if (status < 200 || status >= 400) {
      console.error(`${route}: bad status ${status}`);
      failed = true;
    }
    if (errors.length > 0) {
      console.error(`${route}: page errors`, errors);
      failed = true;
    } else {
      console.log(`${route}: OK (${status})`);
    }

    await page.close();
  }

  await browser.close();
  process.exit(failed ? 1 : 0);
}

main();

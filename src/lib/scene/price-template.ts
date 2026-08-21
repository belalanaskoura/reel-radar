import type { Browser } from 'playwright-core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BranchId } from '@/lib/scene/types';

// Scene's real ticket price is only reachable by locking a live seat into
// a booking-hold session (confirmed live: no static page or JSON response
// carries it -- see fetchScenePriceForFormat below, used only by the
// spot-check job, never by user-facing requests). Admin-maintained
// template prices are the display source of truth instead: cheap, no
// per-page-view browser cost, matching how showtimes_cache.raw_showtimes
// already caches Scene data rather than fetching live on every view.
export interface ScenePriceTemplateRow {
  branchId: BranchId;
  format: string;
  priceEgp: number;
  verifiedAt: string;
}

export async function getScenePriceTemplate(
  supabase: SupabaseClient,
): Promise<ScenePriceTemplateRow[]> {
  const { data } = await supabase
    .from('scene_price_templates')
    .select('branch_id, format, price_egp, verified_at');

  return (data ?? []).map((row) => ({
    branchId: row.branch_id as BranchId,
    format: row.format as string,
    priceEgp: row.price_egp as number,
    verifiedAt: row.verified_at as string,
  }));
}

// A seat's real category name (Scene's own `st`, e.g. "Standard") doesn't
// always match a branch's showtime-level format label 1:1 -- District 5
// lists "Standard & Deluxe" as one combined format, but seat-plan
// categories on that hall are just "Standard" or "Deluxe" individually
// (confirmed against real seat-plan data). The same mismatch applies to
// the AJAX day-showtimes format label /api/check-scene-prices matches
// against, so both call sites share this one fuzzy matcher rather than
// each rolling their own. Matched case-insensitively, substring in either
// direction, so "Standard" matches "Standard & Deluxe" and vice versa.
export function findTemplateRowForFormat(
  template: ScenePriceTemplateRow[],
  branchId: BranchId,
  format: string,
): ScenePriceTemplateRow | null {
  const branchRows = template.filter((r) => r.branchId === branchId);
  const normalizedFormat = format.trim().toLowerCase();
  if (!normalizedFormat) return null;

  const exact = branchRows.find((r) => r.format.trim().toLowerCase() === normalizedFormat);
  if (exact) return exact;

  const partial = branchRows.find((r) => {
    const rowFormat = r.format.trim().toLowerCase();
    return rowFormat.includes(normalizedFormat) || normalizedFormat.includes(rowFormat);
  });
  return partial ?? null;
}

export function matchPriceForCategory(
  template: ScenePriceTemplateRow[],
  branchId: BranchId,
  category: string,
): number | null {
  return findTemplateRowForFormat(template, branchId, category)?.priceEgp ?? null;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const REAL_SEAT_LABEL = /^[A-Z]+\d+$/;

interface SeatPlanApiRow {
  app_id: string;
  st: string;
  st_name: string;
  st_txt: string;
  app_category_id: string;
}

// Best-effort, real-money-free price read for ONE category on a live
// showtime: locks a free seat of that category into Scene's real
// booking-hold session just long enough to read the resulting cart
// total, then unlocks it (confirmed live: a locked seat can be cleanly
// released via the same lock_seat endpoint with request_action=unlock --
// this never leaves a real seat held). Used only by the spot-check job
// (src/app/api/check-scene-prices/route.ts) to catch template drift; the
// live seat page NEVER calls this; it only ever reads the admin-
// maintained template (see getScenePriceTemplate above).
//
// This is deliberately narrow -- one category per call -- rather than a
// full per-branch sweep, both to keep one run's duration well inside
// Vercel Hobby's function timeout and because the underlying lock click
// is real automation against a third-party Vue widget: confirmed live
// that clicking before the seat element is actually visible races its
// render and silently fails (no error, lock never fires), so this always
// waits for real visibility first rather than a fixed delay -- but a
// third-party UI can still change without notice, so callers must treat
// a null return as "couldn't verify this run," not "price is unknown."
export async function fetchScenePriceForFormat(
  browser: Browser,
  showtimeUrl: string,
  category: string,
): Promise<number | null> {
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'en-US' });
  const page = await context.newPage();

  try {
    const seatPlanResponse = page.waitForResponse(
      (res) => res.url().includes('/seat-plan') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.goto(showtimeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const res = await seatPlanResponse;
    const body = (await res.json()) as { status: number; data: SeatPlanApiRow[] };
    if (body.status !== 1 || !Array.isArray(body.data)) return null;

    const targetRow = body.data.find(
      (row) => row.st_name === 'Free' && row.st === category && REAL_SEAT_LABEL.test(row.st_txt),
    );
    if (!targetRow) return null; // No free seat of this category right now -- not an error, just unavailable.

    // The terms dialog only appears on a session's first showtime visit;
    // best-effort dismiss, absent on some loads.
    const agreeButton = page.getByText('I AGREE', { exact: true });
    if ((await agreeButton.count().catch(() => 0)) > 0) {
      await agreeButton.first().click().catch(() => {});
    }

    const seatSelector = `#${targetRow.app_id}`;
    await page.waitForSelector(seatSelector, { state: 'visible', timeout: 15_000 });

    const lockResponse = page.waitForResponse((r) => r.url().includes('lock_seat'), { timeout: 10_000 });
    await page.locator(seatSelector).click({ timeout: 5_000 });
    const lockRes = await lockResponse.catch(() => null);
    const lockOk = lockRes && (await lockRes.text()).trim() === '1';
    if (!lockOk) return null;

    let priceEgp: number | null = null;
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500);
      const bodyText = await page.evaluate(() => document.body.innerText);
      const match = bodyText.match(/(\d+(\.\d+)?)\s?EGP/);
      if (match && Number(match[1]) > 0) {
        priceEgp = Number(match[1]);
        break;
      }
    }

    // Always attempt to release the lock, even if the price read above
    // failed -- a held seat that's never released would otherwise sit
    // locked against a real showtime for no reason.
    const unlockResponse = page.waitForResponse((r) => r.url().includes('lock_seat'), { timeout: 10_000 });
    await page.locator(seatSelector).click({ timeout: 5_000 }).catch(() => {});
    await unlockResponse.catch(() => {});

    return priceEgp;
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

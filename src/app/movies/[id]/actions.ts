'use server';

import { fetchDayShowtimes } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import type { SceneDayShowtimes } from '@/lib/scene/types';
import { isValidSceneSlug, isValidShowtimeDate } from '@/lib/scene/dates';

// Fetches one specific day's showtimes for one branch, on demand: called
// only when a user expands a day in the UI, not eagerly for every bookable
// day on page load (a movie can be bookable across 8+ days per branch;
// fetching all of them upfront would mean 16+ live Scene requests per
// detail-page view, which conflicts with the low-request-volume principle
// this project has followed since Phase 0).
// SECURITY: slug and date are both spliced into an outbound URL
// (`${base}/movie-details/${slug}.html?business_day=${date}&ajax=1`) and
// this is a 'use server' export, i.e. a public endpoint anyone can call
// with anything. The host is pinned by BRANCH_BASE_URLS so this was never
// full SSRF, but the path and query string were caller-controlled against
// a third-party site. Both are now shape-checked before they get near a
// URL.
export async function getDayShowtimes(
  branchId: string,
  slug: string,
  date: string,
): Promise<SceneDayShowtimes> {
  const baseUrl = BRANCH_BASE_URLS[branchId as BranchId];
  if (!baseUrl) throw new Error(`Unknown branch: ${branchId}`);
  if (!isValidSceneSlug(slug)) throw new Error('Invalid slug');
  if (!isValidShowtimeDate(date)) throw new Error('Invalid date');
  const movieDetailsUrl = `${baseUrl}/movie-details/${slug}.html`;
  return fetchDayShowtimes(movieDetailsUrl, date);
}

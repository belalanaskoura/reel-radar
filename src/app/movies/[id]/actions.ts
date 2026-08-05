'use server';

import { fetchDayShowtimes } from '@/lib/scene/fetcher';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';
import type { SceneDayShowtimes } from '@/lib/scene/types';

// Fetches one specific day's showtimes for one branch, on demand -- called
// only when a user expands a day in the UI, not eagerly for every bookable
// day on page load (a movie can be bookable across 8+ days per branch;
// fetching all of them upfront would mean 16+ live Scene requests per
// detail-page view, which conflicts with the low-request-volume principle
// this project has followed since Phase 0).
export async function getDayShowtimes(
  branchId: string,
  slug: string,
  date: string,
): Promise<SceneDayShowtimes> {
  const baseUrl = BRANCH_BASE_URLS[branchId as BranchId];
  if (!baseUrl) throw new Error(`Unknown branch: ${branchId}`);
  const movieDetailsUrl = `${baseUrl}/movie-details/${slug}.html`;
  return fetchDayShowtimes(movieDetailsUrl, date);
}

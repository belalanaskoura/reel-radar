export type SceneBranchId = 'cfc' | 'district5';
export type VoxBranchId = 'vox-moe' | 'vox-alex' | 'vox-almaza';
export type BranchId = SceneBranchId | VoxBranchId;
export type Chain = 'scene' | 'vox';

export const VOX_ELCINEMA_THEATER_IDS: Record<VoxBranchId, string> = {
  'vox-moe': '3101271',
  'vox-alex': '3101027',
  'vox-almaza': '3101353',
};

// VOX has one site for all 3 branches (no per-branch subdomain, unlike
// Scene), but does have real per-branch slugs on that one site, used to
// build a branch-specific showtimes link below. A day-AND-movie-specific
// link (VOX's own movie slug + `?d=` param) was separately investigated
// and shelved: getting VOX's own movie slugs required a full headless
// browser to get past their Akamai bot protection, which doesn't run
// reliably on Vercel (see docs/HISTORY.md's VOX section for the full
// story) -- not worth the infrastructure for that. Branch-level slugs,
// by contrast, are static and few (3), confirmed directly against the
// live site, no scraping needed.
export const VOX_HOMEPAGE_URL = 'https://egy.voxcinemas.com/';

export const VOX_BRANCH_SLUGS: Record<VoxBranchId, string> = {
  'vox-moe': 'mall-of-egypt',
  'vox-alex': 'city-centre-alexandria',
  'vox-almaza': 'city-centre-almaza',
};

// A real, branch-specific showtimes page -- never fetched by this app's
// own server (VOX's robots.txt disallows any URL with a query string,
// `Disallow: *?*`), only ever placed as an <a href> for a signed-in
// user's own browser to open, same as any outbound link to another site.
export function voxBranchShowtimesUrl(branchId: VoxBranchId): string {
  return `${VOX_HOMEPAGE_URL}showtimes?c=${VOX_BRANCH_SLUGS[branchId]}`;
}

// Prefix-based, not a DB round trip: several call sites (WatchlistGrid,
// the movie detail page's booking-link helper) only have a bare branch
// id string in hand, not a full `branches` row. Anywhere that already
// has the full row (the /cinemas pages) should read `branch.chain`
// directly instead.
export function chainForBranch(branchId: string): Chain {
  return branchId.startsWith('vox-') ? 'vox' : 'scene';
}

// The shape stored in showtimes_cache.raw_showtimes for VOX rows -- an
// array of one entry per bookable day, each with the real per-format
// showtime detail elCinema returns (see fetchVoxShowtimes). Scene rows
// store a plain string[] of dd-mm-yyyy dates in the same jsonb column
// instead (see src/lib/scene/dates.ts) -- always branch on
// chainForBranch()/branch.chain before reading raw_showtimes, never
// assume one shape.
export interface VoxDayDetail {
  date: string; // YYYY-MM-DD
  formats: { format: string; showtimes: { time: string; price: string | null }[] }[];
}

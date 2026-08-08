export type SceneBranchId = 'cfc' | 'district5';
export type VoxBranchId = 'vox-moe' | 'vox-alex' | 'vox-almaza';
export type BranchId = SceneBranchId | VoxBranchId;
export type Chain = 'scene' | 'vox';

export const VOX_ELCINEMA_THEATER_IDS: Record<VoxBranchId, string> = {
  'vox-moe': '3101271',
  'vox-alex': '3101027',
  'vox-almaza': '3101353',
};

export const VOX_HOMEPAGE_URL = 'https://egy.voxcinemas.com/';

// Prefix-based, not a DB round trip: several call sites (WatchlistGrid,
// the movie detail page's booking-link helper) only have a bare branch
// id string in hand, not a full `branches` row. Anywhere that already
// has the full row (the /cinemas pages) should read `branch.chain`
// directly instead.
export function chainForBranch(branchId: string): Chain {
  return branchId.startsWith('vox-') ? 'vox' : 'scene';
}

// Builds a VOX booking link for a specific day, for a human to click --
// never fetched by this app's own server. VOX's robots.txt disallows any
// URL with a query string (`Disallow: *?*`) alongside `/booking/`, so
// this app never requests this URL itself; it only appears as an <a
// href> for the signed-in user's own browser to open, the same as any
// outbound link to another site. `date` is YYYY-MM-DD.
export function voxBookingUrl(voxSlug: string, date: string): string {
  const compact = date.replaceAll('-', ''); // YYYYMMDD, matching VOX's own ?d= format
  return `${VOX_HOMEPAGE_URL}movies/${voxSlug}?d=${compact}#showtimes`;
}

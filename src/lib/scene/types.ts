export type BranchId = 'cfc' | 'district5';

export const BRANCH_BASE_URLS: Record<BranchId, string> = {
  cfc: 'https://cfc.scenecinemas.com',
  district5: 'https://district5.scenecinemas.com',
};

export interface SceneMovieListing {
  title: string;
  slug: string;
  url: string;
  source: 'now_showing' | 'coming_soon';
}

export interface SceneShowtime {
  format: string; // e.g. "Premiere", "Standard"
  time: string; // e.g. "10:30 AM"
  bookingUrl: string;
  soldOut: boolean;
}

export interface SceneDayShowtimes {
  date: string; // dd-mm-yyyy, matching Scene's business_day param
  showtimes: SceneShowtime[];
}

export interface BookabilityResult {
  bookable: boolean;
  // Populated only when bookable -- the day list found on the movie-details
  // page. Per-day showtime detail is a separate, heavier fetch (one request
  // per day) so callers decide whether they need it.
  availableDates: string[];
}

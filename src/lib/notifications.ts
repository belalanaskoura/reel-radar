export interface BookableNotification {
  movieTitle: string;
  branchName: string;
  bookingUrl: string;
}

export interface NewReleaseNotification {
  movieTitle: string;
  releaseDate: string;
  movieUrl: string;
}

export function formatCheckedTimestamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

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

export interface LineupAddedNotification {
  movieTitle: string;
  branchName: string;
  movieUrl: string;
}

export interface LineupRemovedNotification {
  movieTitle: string;
  branchName: string;
  cinemaUrl: string;
}

export function formatCheckedTimestamp(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} EET`;
}

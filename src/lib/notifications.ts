// movieId and removeToken power the "Remove from radar" action (see
// src/lib/radar-link.ts). removeToken is null when RADAR_LINK_SECRET isn't
// set, and the action is simply left out.
export interface RadarRemoveAction {
  movieId: string;
  removeToken: string | null;
}

export interface BookableNotification extends RadarRemoveAction {
  movieTitle: string;
  branchName: string;
  bookingUrl: string;
}

export interface NewReleaseNotification extends RadarRemoveAction {
  movieTitle: string;
  releaseDate: string;
  movieUrl: string;
}

// Daily follow-up for a movie that's still on someone's radar and still
// bookable. One per (user, movie), listing every bookable branch the user
// gets alerts for, rather than one per branch.
export interface ShowtimeReminderNotification extends RadarRemoveAction {
  movieTitle: string;
  branches: { name: string; bookingUrl: string }[];
  showtimesUrl: string;
  settingsUrl: string;
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

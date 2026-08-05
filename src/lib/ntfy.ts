const NTFY_BASE_URL = 'https://ntfy.sh';
const REQUEST_TIMEOUT_MS = 15_000;

export interface BookableNotification {
  movieTitle: string;
  branchName: string;
  bookingUrl: string;
}

// Sends a push notification to one user's private ntfy topic when a
// watched movie becomes bookable at a branch. Message format matches
// spider-bot's notifier.py: title, booking link, and a timestamp so the
// user can see when it was detected.
// HTTP headers aren't reliably UTF-8 safe across every client/proxy in the
// path to ntfy.sh (ntfy's own docs flag this as a common gotcha), so the
// Title header specifically gets stripped to ASCII. The message body has
// no such constraint and keeps the real title as-is.
function toAsciiHeaderSafe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, '');
}

export async function notifyBookable(
  ntfyTopic: string,
  notification: BookableNotification,
): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const message = `${notification.movieTitle} is bookable at ${notification.branchName}!\n${notification.bookingUrl}\nChecked: ${timestamp}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${NTFY_BASE_URL}/${ntfyTopic}`, {
      method: 'POST',
      body: message,
      headers: {
        Title: toAsciiHeaderSafe(`${notification.movieTitle} tickets available!`),
        Priority: 'urgent',
        Tags: 'ticket',
        Click: notification.bookingUrl,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`ntfy request failed: ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

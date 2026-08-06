import { formatCheckedTimestamp, type BookableNotification, type NewReleaseNotification } from '@/lib/ntfy';

const RESEND_API_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 15_000;

export async function notifyBookableByEmail(
  toEmail: string,
  notification: BookableNotification,
): Promise<void> {
  const timestamp = formatCheckedTimestamp();
  const text = `${notification.movieTitle} is bookable at ${notification.branchName}!\n${notification.bookingUrl}\nChecked: ${timestamp}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="font-size: 20px; color: #14201d;">${notification.movieTitle} is bookable</h1>
      <p style="font-size: 15px; color: #5c6b67;">
        Tickets are now available at ${notification.branchName}.
      </p>
      <p>
        <a href="${notification.bookingUrl}"
           style="display: inline-block; margin-top: 8px; padding: 10px 20px; border-radius: 4px; background: #00534c; color: #ffffff; text-decoration: none; font-weight: 600;">
          Book now
        </a>
      </p>
      <p style="font-size: 12px; color: #8ea19b; margin-top: 24px;">Checked: ${timestamp}</p>
    </div>
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: toEmail,
        subject: `${notification.movieTitle} tickets are live!`,
        html,
        text,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Resend request failed: ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyNewReleaseByEmail(
  toEmail: string,
  notification: NewReleaseNotification,
): Promise<void> {
  const text = `${notification.movieTitle} is coming to Egypt on ${notification.releaseDate}!\n${notification.movieUrl}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="font-size: 20px; color: #14201d;">${notification.movieTitle} release date confirmed</h1>
      <p style="font-size: 15px; color: #5c6b67;">
        Coming to Egypt on ${notification.releaseDate}.
      </p>
      <p>
        <a href="${notification.movieUrl}"
           style="display: inline-block; margin-top: 8px; padding: 10px 20px; border-radius: 4px; background: #00534c; color: #ffffff; text-decoration: none; font-weight: 600;">
          View movie
        </a>
      </p>
    </div>
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: toEmail,
        subject: `${notification.movieTitle} is coming to Egypt`,
        html,
        text,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Resend request failed: ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

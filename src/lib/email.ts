import { formatCheckedTimestamp, type BookableNotification, type NewReleaseNotification } from '@/lib/notifications';
import type { DataQualityIssue } from '@/lib/matching/data-quality';

const RESEND_API_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 15_000;

export interface FeedbackNotification {
  fromEmail: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function notifyFeedbackByEmail(notification: FeedbackNotification): Promise<void> {
  const adminEmail = process.env.FEEDBACK_TO_EMAIL;
  if (!adminEmail) return;

  const text = `From: ${notification.fromEmail}\n\n${notification.message}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="font-size: 20px; color: #14201d;">New feedback</h1>
      <p style="font-size: 13px; color: #8ea19b;">From ${escapeHtml(notification.fromEmail)}</p>
      <p style="font-size: 15px; color: #14201d; white-space: pre-wrap;">${escapeHtml(notification.message)}</p>
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
        to: adminEmail,
        replyTo: notification.fromEmail,
        subject: 'ReelRadar feedback',
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

// Admin-only digest of data-quality issues (see
// src/lib/matching/data-quality.ts) -- sent to FEEDBACK_TO_EMAIL, the
// same single admin inbox the /feedback form already uses, rather than
// a new env var for what's the same "the admin's own address" concept.
// Grouped by issue kind with a direct /movies/{id} link per row so
// clicking through goes straight to the affected movie, not just a
// title to search for manually.
export async function notifyAdminDigestByEmail(issues: DataQualityIssue[]): Promise<void> {
  const adminEmail = process.env.FEEDBACK_TO_EMAIL;
  if (!adminEmail) return;
  if (issues.length === 0) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const noPoster = issues.filter((i): i is Extract<DataQualityIssue, { kind: 'no_poster' }> => i.kind === 'no_poster');
  const noOverview = issues.filter(
    (i): i is Extract<DataQualityIssue, { kind: 'no_overview' }> => i.kind === 'no_overview',
  );
  const stuckBacklog = issues.filter(
    (i): i is Extract<DataQualityIssue, { kind: 'stuck_backlog' }> => i.kind === 'stuck_backlog',
  );

  const section = (title: string, rows: { movieId: string; title: string; extra?: string }[]) => {
    if (rows.length === 0) return '';
    const items = rows
      .map(
        (r) =>
          `<li style="margin-bottom: 4px;"><a href="${siteUrl}/movies/${r.movieId}" style="color: #00534c;">${escapeHtml(r.title)}</a>${r.extra ? ` <span style="color: #8ea19b;">${escapeHtml(r.extra)}</span>` : ''}</li>`,
      )
      .join('');
    return `<h2 style="font-size: 15px; color: #14201d; margin-top: 20px; margin-bottom: 6px;">${title} (${rows.length})</h2><ul style="padding-left: 18px; font-size: 14px; color: #14201d;">${items}</ul>`;
  };

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <h1 style="font-size: 20px; color: #14201d;">ReelRadar data quality digest</h1>
      <p style="font-size: 13px; color: #8ea19b;">${issues.length} issue${issues.length === 1 ? '' : 's'} found.</p>
      ${section('No poster', noPoster)}
      ${section(
        'Matched but no synopsis',
        noOverview.map((i) => ({ movieId: i.movieId, title: i.title, extra: `tmdb ${i.tmdbId}` })),
      )}
      ${section(
        'Stuck unmatched/ambiguous',
        stuckBacklog.map((i) => ({ movieId: i.movieId, title: i.title, extra: `${i.matchStatus}, ${i.daysStuck}d` })),
      )}
      <p style="margin-top: 24px;"><a href="${siteUrl}/admin/matching" style="color: #00534c; font-weight: 600;">Open the admin matching page →</a></p>
    </div>
  `;

  const textLines = [
    `${issues.length} data quality issue(s) found.`,
    ...noPoster.map((i) => `[no poster] ${i.title} — ${siteUrl}/movies/${i.movieId}`),
    ...noOverview.map((i) => `[no synopsis] ${i.title} (tmdb ${i.tmdbId}) — ${siteUrl}/movies/${i.movieId}`),
    ...stuckBacklog.map(
      (i) => `[stuck ${i.matchStatus}, ${i.daysStuck}d] ${i.title} — ${siteUrl}/movies/${i.movieId}`,
    ),
  ];

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
        to: adminEmail,
        subject: `ReelRadar: ${issues.length} data quality issue${issues.length === 1 ? '' : 's'}`,
        html,
        text: textLines.join('\n'),
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

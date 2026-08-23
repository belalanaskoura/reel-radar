import {
  formatCheckedTimestamp,
  type BookableNotification,
  type NewReleaseNotification,
  type LineupAddedNotification,
  type LineupRemovedNotification,
} from '@/lib/notifications';
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
  const priceMismatches = issues.filter(
    (i): i is Extract<DataQualityIssue, { kind: 'price_mismatch' }> => i.kind === 'price_mismatch',
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

  const priceMismatchSection =
    priceMismatches.length === 0
      ? ''
      : `<h2 style="font-size: 15px; color: #14201d; margin-top: 20px; margin-bottom: 6px;">Scene price template mismatch (${priceMismatches.length})</h2><ul style="padding-left: 18px; font-size: 14px; color: #14201d;">${priceMismatches
          .map(
            (i) =>
              `<li style="margin-bottom: 4px;">${escapeHtml(i.branchId)} · ${escapeHtml(i.format)}: template says ${i.templatePriceEgp} EGP, live read ${i.liveObservedPriceEgp} EGP</li>`,
          )
          .join('')}</ul>`;

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
      ${priceMismatchSection}
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
    ...priceMismatches.map(
      (i) =>
        `[price mismatch] ${i.branchId} ${i.format}: template ${i.templatePriceEgp} EGP, live ${i.liveObservedPriceEgp} EGP`,
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

// Admin-triggered broadcast to a real user's own address (not the admin
// inbox, unlike every other function in this file) -- see
// src/app/admin/broadcast/actions.ts. Subject/body are admin-authored
// per send, not fixed copy, so this takes them as plain params rather
// than building its own HTML shell around a hardcoded message.
export async function notifyBroadcastByEmail(
  toEmail: string,
  subject: string,
  message: string,
): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 15px; color: #14201d; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message)}</p>
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
        subject,
        html,
        text: message,
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

// One-time welcome email for a new signup -- see
// src/app/api/welcome-email/route.ts, the scheduled job that decides who
// qualifies and whether their push subscription is on yet by the time it
// runs. Content branches on that: a push-enabled user just gets pointed
// at what to do next, a push-disabled one also gets the Android/iOS
// steps to turn it on, since without push they'd otherwise have no way
// to know a watchlisted title opened for booking. Signed as a person,
// not "the ReelRadar team" -- there isn't one -- and replies go to
// FEEDBACK_TO_EMAIL, the same personal inbox every other reply-to in
// this file already points at.
export async function notifyWelcomeByEmail(
  toEmail: string,
  { displayName, pushEnabled }: { displayName: string; pushEnabled: boolean },
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const firstName = displayName.trim().split(/\s+/)[0] || 'there';
  const safeFirstName = escapeHtml(firstName);

  const featureRow = (href: string, title: string, description: string) => `
    <div style="margin-bottom: 16px;">
      <a href="${href}" style="font-size: 15px; font-weight: 600; color: #00534c; text-decoration: none;">${title} &rarr;</a>
      <p style="margin: 2px 0 0; font-size: 13px; color: #5c6b67; line-height: 1.5;">${description}</p>
    </div>
  `;

  const featuresHtml = `
    ${featureRow(`${siteUrl}/browse`, "Browse what's playing", 'Everything bookable now or coming soon at Scene and VOX, across every branch.')}
    ${featureRow(`${siteUrl}/watchlist`, 'Start a watchlist', "Add a title before it's even listed and I'll watch it for you.")}
    ${featureRow(`${siteUrl}/cinemas`, 'Follow a cinema', "Get alerts for a specific branch's showtimes, not just your watchlist.")}
    ${featureRow(`${siteUrl}/account/edit`, 'Set your name and photo', "Add a display name and a profile picture so the app feels like yours.")}
  `;

  const pushHtml = pushEnabled
    ? `
      <div style="margin-top: 24px; padding: 14px 16px; border-radius: 6px; background: #eaf5f2; border: 1px solid #cfe9e2;">
        <p style="margin: 0; font-size: 14px; color: #00534c; font-weight: 600;">Notifications are already on</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #5c6b67; line-height: 1.5;">
          You're set. The moment something on your watchlist opens for booking, you'll get a push straight to your device, plus an email.
        </p>
      </div>
    `
    : `
      <div style="margin-top: 24px; padding: 16px; border-radius: 6px; background: #fbf3e6; border: 1px solid #eddcb8;">
        <p style="margin: 0 0 4px; font-size: 14px; color: #14201d; font-weight: 600;">One more thing: notifications aren't on yet</p>
        <p style="margin: 0 0 14px; font-size: 13px; color: #5c6b67; line-height: 1.5;">
          Without them you'll have to check back manually. Turning them on takes a couple of taps:
        </p>

        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #00534c;">On Android</p>
        <ol style="margin: 0 0 14px; padding-left: 18px; font-size: 13px; color: #14201d; line-height: 1.6;">
          <li>Open reelradar.online in Chrome</li>
          <li>Tap "Enable notifications" below</li>
          <li>Tap Allow when Chrome asks</li>
        </ol>

        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #00534c;">On iPhone/iPad</p>
        <ol style="margin: 0; padding-left: 18px; font-size: 13px; color: #14201d; line-height: 1.6;">
          <li>Open reelradar.online in Safari</li>
          <li>Tap the Share icon, then "Add to Home Screen"</li>
          <li>Open ReelRadar from the new icon (not from Safari)</li>
          <li>Sign in again and tap "Enable notifications" (iOS only allows push from the installed app, not the browser tab)</li>
        </ol>

        <p style="margin-top: 16px;">
          <a href="${siteUrl}/notifications"
             style="display: inline-block; padding: 10px 20px; border-radius: 4px; background: #00534c; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 13px;">
            Turn on notifications
          </a>
        </p>
      </div>
    `;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="font-size: 22px; color: #14201d; margin-bottom: 4px;">Welcome to ReelRadar, ${safeFirstName}</h1>
      <p style="font-size: 15px; color: #5c6b67; line-height: 1.6;">
        Thanks for signing up. ReelRadar started as a script I wrote for myself so I'd stop refreshing a
        cinema's booking page by hand, and I built the rest of it wanting it to be just as useful for
        you. I hope it doesn't let you down.
      </p>

      <h2 style="font-size: 13px; color: #14201d; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 28px; margin-bottom: 14px;">
        Here's where to start
      </h2>
      ${featuresHtml}
      ${pushHtml}

      <p style="font-size: 13px; color: #5c6b67; margin-top: 28px; line-height: 1.6;">
        If anything looks off, or something's missing, reply to this email. It comes straight to me.
        There's no support team behind this, just me.
      </p>
      <p style="font-size: 14px; color: #14201d; margin-top: 20px;">
        Belal<br />
        <span style="color: #8ea19b; font-size: 12px;">Building ReelRadar solo</span>
      </p>
    </div>
  `;

  const textLines = [
    `Welcome to ReelRadar, ${firstName}.`,
    '',
    "Thanks for signing up. ReelRadar started as a script I wrote for myself so I'd stop refreshing a cinema's booking page by hand, and I built the rest of it wanting it to be just as useful for you. I hope it doesn't let you down.",
    '',
    "Where to start:",
    `- Browse what's playing: ${siteUrl}/browse`,
    `- Start a watchlist: ${siteUrl}/watchlist`,
    `- Follow a cinema: ${siteUrl}/cinemas`,
    `- Set your name and photo: ${siteUrl}/account/edit`,
    '',
  ];

  if (pushEnabled) {
    textLines.push(
      "Notifications are already on. You're set. The moment something on your watchlist opens for booking, you'll get a push straight to your device, plus an email.",
    );
  } else {
    textLines.push(
      "One more thing: notifications aren't on yet, so you'll have to check back manually. Turning them on takes a couple of taps:",
      '',
      'On Android: open reelradar.online in Chrome, tap "Enable notifications", then tap Allow.',
      'On iPhone/iPad: open reelradar.online in Safari, tap Share, then "Add to Home Screen", open ReelRadar from the new icon (not Safari), sign in again, then tap "Enable notifications" (iOS only allows push from the installed app, not the browser tab).',
      '',
      `Turn it on here: ${siteUrl}/notifications`,
    );
  }

  textLines.push(
    '',
    "If anything looks off, just reply to this email. It comes straight to me, there's no support team behind this, just me.",
    '',
    'Belal',
  );

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
        replyTo: process.env.FEEDBACK_TO_EMAIL,
        subject: pushEnabled ? "Welcome to ReelRadar, you're all set" : 'Welcome to ReelRadar, one more step',
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

export async function notifyLineupAddedByEmail(
  toEmail: string,
  notification: LineupAddedNotification,
): Promise<void> {
  const text = `${notification.movieTitle} was just added to ${notification.branchName}'s lineup.\n${notification.movieUrl}`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="font-size: 20px; color: #14201d;">${notification.movieTitle} is now at ${notification.branchName}</h1>
      <p style="font-size: 15px; color: #5c6b67;">
        It just joined the lineup at a cinema you follow.
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
        subject: `${notification.movieTitle} just landed at ${notification.branchName}`,
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

export async function notifyLineupRemovedByEmail(
  toEmail: string,
  notification: LineupRemovedNotification,
): Promise<void> {
  const text = `${notification.movieTitle} has left ${notification.branchName}'s lineup.`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="font-size: 20px; color: #14201d;">${notification.movieTitle} has left ${notification.branchName}</h1>
      <p style="font-size: 15px; color: #5c6b67;">
        It's no longer playing at a cinema you follow.
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
        subject: `${notification.movieTitle} left ${notification.branchName}`,
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

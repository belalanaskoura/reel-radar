import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BookableNotification,
  NewReleaseNotification,
  LineupAddedNotification,
  LineupRemovedNotification,
} from '@/lib/notifications';
import { formatCheckedTimestamp } from '@/lib/notifications';
import { isAllowedPushEndpoint } from '@/lib/push-endpoint';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

// Sends one push message to every subscription a user has (multiple
// devices/browsers each register their own). A subscription that the
// push service reports as gone (410) or not found (404) is deleted
// immediately rather than left to fail again on every future poll.
async function sendToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  ensureConfigured();

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) return 0;

  let sent = 0;
  for (const sub of subs) {
    // Checked again on the way out, not just on the way in: rows stored
    // before /api/push/subscribe validated endpoints are still in this
    // table, and this is the point where an endpoint actually becomes an
    // outbound request.
    if (!isAllowedPushEndpoint(sub.endpoint)) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
      // other failures (network blip, 5xx from the push service) are
      // best-effort, swallowed here same as the email channel
    }
  }
  return sent;
}

export async function notifyBookablePush(
  supabase: SupabaseClient,
  userId: string,
  notification: BookableNotification,
): Promise<number> {
  const timestamp = formatCheckedTimestamp();
  return sendToUser(supabase, userId, {
    title: `${notification.movieTitle} tickets available!`,
    body: `Bookable at ${notification.branchName} now. Checked: ${timestamp}`,
    url: notification.bookingUrl,
  });
}

export async function notifyNewReleasePush(
  supabase: SupabaseClient,
  userId: string,
  notification: NewReleaseNotification,
): Promise<number> {
  return sendToUser(supabase, userId, {
    title: `${notification.movieTitle} release date confirmed`,
    body: `Coming to Egypt on ${notification.releaseDate}.`,
    url: notification.movieUrl,
  });
}

export async function notifyLineupAddedPush(
  supabase: SupabaseClient,
  userId: string,
  notification: LineupAddedNotification,
): Promise<number> {
  return sendToUser(supabase, userId, {
    title: `${notification.movieTitle} is now at ${notification.branchName}`,
    body: `Just joined the lineup at a cinema you track.`,
    url: notification.movieUrl,
  });
}

export async function notifyLineupRemovedPush(
  supabase: SupabaseClient,
  userId: string,
  notification: LineupRemovedNotification,
): Promise<number> {
  return sendToUser(supabase, userId, {
    title: `${notification.movieTitle} has left ${notification.branchName}`,
    body: `No longer playing at a cinema you track.`,
    url: notification.cinemaUrl,
  });
}

// Admin-triggered broadcast to a real user's own subscriptions -- see
// src/app/admin/broadcast/actions.ts. title/body are admin-authored per
// send, same reasoning as notifyBroadcastByEmail. url falls back to the
// site root since a broadcast isn't tied to any one movie/page.
export async function notifyBroadcastPush(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  body: string,
): Promise<number> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return sendToUser(supabase, userId, { title, body, url: siteUrl || '/' });
}

// Admin data-quality digest push -- same push_subscriptions/user_id
// mechanism as any watchlist notification, just to whichever admin
// user(s) the caller resolves (see admin-digest/route.ts, which looks
// up every ADMIN_EMAILS address's auth.users id), not a watcher.
export async function notifyAdminDigestPush(
  supabase: SupabaseClient,
  userId: string,
  issueCount: number,
): Promise<number> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return sendToUser(supabase, userId, {
    title: `${issueCount} data quality issue${issueCount === 1 ? '' : 's'} found`,
    body: 'Missing posters, unresolved matches, or movies with no synopsis.',
    url: `${siteUrl}/admin/matching`,
  });
}

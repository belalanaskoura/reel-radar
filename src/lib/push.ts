import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookableNotification, NewReleaseNotification } from '@/lib/notifications';
import { formatCheckedTimestamp } from '@/lib/notifications';

const VAPID_SUBJECT = 'mailto:belalhamada489@gmail.com';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    VAPID_SUBJECT,
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

'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { listAllUsers } from '@/lib/list-all-users';
import { isAdminUser } from '@/lib/admin';
import { notifyBroadcastByEmail } from '@/lib/email';
import { notifyBroadcastPush } from '@/lib/push';
import { logEvent } from '@/lib/analytics';
import { mapWithConcurrency } from '@/lib/concurrency';

// A broadcast targets every user by design (or a hand-picked subset), and
// runs synchronously inside one admin server-action request -- a fully
// sequential fan-out here doesn't just risk a timeout, it blocks the
// admin's own browser tab for the entire duration. Same concurrency cap
// used elsewhere for this shape.
const BROADCAST_CONCURRENCY = 10;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminUser(user)) {
    throw new Error('Not authorized');
  }
}

export type BroadcastChannel = 'email' | 'push';

export type BroadcastResult =
  | {
      ok: true;
      channelsSent: BroadcastChannel[];
      recipientCount: number;
      emailSent: number;
      emailFailed: number;
      pushSent: number;
    }
  | { ok: false; error: string };

// Admin-authored message either to every real signed-up user (recipientIds
// omitted) or to a specific hand-picked subset (recipientIds provided --
// the admin/broadcast page's "Specific users" mode), over one or both
// channels (see BroadcastChannel -- defaults to both if omitted, matching
// this function's original behavior). Channels are independent (email via
// Resend, push via web-push) -- mirrors the existing per-user notification
// paths' "one channel's failure can't block the other, and one user's
// failure can't block the rest" pattern (see /api/poll's notifyWatchers),
// just fanned out to the target user set instead of one movie's watchers.
//
// Logs one real notification_deliveries row per user per channel, same
// as every other notification path (movie_id/branch_id null -- a
// broadcast has neither; the column NOT NULL constraint was relaxed for
// this). Originally only logged a broadcast_run analytics_events
// summary, which meant a real send was completely invisible on the
// Notifications page's chart/stats (that page reads notification_
// deliveries only) -- writing real per-user rows here means broadcasts
// show up correctly everywhere else already reads that table, with no
// special-casing needed on the reporting side. The broadcast_run summary
// event is still logged too, since /admin/broadcast's own result panel
// and future per-send auditing still want a single "this send happened,
// here's the aggregate outcome" record.
export async function sendBroadcast(
  subject: string,
  message: string,
  recipientIds?: string[],
  channels: BroadcastChannel[] = ['email', 'push'],
): Promise<BroadcastResult> {
  await requireAdmin();

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  if (!trimmedSubject || !trimmedMessage) {
    return { ok: false, error: 'Subject and message are both required.' };
  }
  if (recipientIds && recipientIds.length === 0) {
    return { ok: false, error: 'Pick at least one recipient.' };
  }
  if (channels.length === 0) {
    return { ok: false, error: 'Pick at least one channel.' };
  }
  const sendEmail = channels.includes('email');
  const sendPush = channels.includes('push');

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  let allUsers;
  try {
    allUsers = await listAllUsers(supabase);
  } catch (err) {
    return { ok: false, error: `Couldn't list users: ${err instanceof Error ? err.message : 'unknown error'}` };
  }
  const recipientIdSet = recipientIds ? new Set(recipientIds) : null;
  const users = allUsers
    .filter((u): u is typeof u & { email: string } => !!u.email)
    .filter((u) => !recipientIdSet || recipientIdSet.has(u.id));

  type UserOutcome = { emailSent: boolean; emailFailed: boolean; pushSent: boolean; pushFailed: boolean };

  const outcomes = await mapWithConcurrency(users, BROADCAST_CONCURRENCY, async (user): Promise<UserOutcome> => {
    const outcome: UserOutcome = { emailSent: false, emailFailed: false, pushSent: false, pushFailed: false };

    if (sendEmail) {
      try {
        await notifyBroadcastByEmail(user.email, trimmedSubject, trimmedMessage);
        outcome.emailSent = true;
        await supabase.from('notification_deliveries').insert({
          user_id: user.id,
          movie_id: null,
          branch_id: null,
          channel: 'email',
          success: true,
        });
      } catch (err) {
        outcome.emailFailed = true;
        await supabase.from('notification_deliveries').insert({
          user_id: user.id,
          movie_id: null,
          branch_id: null,
          channel: 'email',
          success: false,
          error: String(err).slice(0, 500),
        });
      }
    }

    if (sendPush) {
      try {
        const sentCount = await notifyBroadcastPush(supabase, user.id, trimmedSubject, trimmedMessage);
        // sentCount === 0 means the user has zero push_subscriptions rows
        // -- sendToUser returns early without ever attempting a real send
        // (see push.ts), so there's no delivery event to log at all here,
        // same as a watchlist notification never logs anything for a
        // user with push simply switched off. Only a real attempted send
        // (sentCount > 0, meaning at least one device was actually hit)
        // is worth a notification_deliveries row.
        if (sentCount > 0) {
          outcome.pushSent = true;
          await supabase.from('notification_deliveries').insert({
            user_id: user.id,
            movie_id: null,
            branch_id: null,
            channel: 'push',
            success: true,
          });
        }
      } catch (err) {
        outcome.pushFailed = true;
        await supabase.from('notification_deliveries').insert({
          user_id: user.id,
          movie_id: null,
          branch_id: null,
          channel: 'push',
          success: false,
          error: String(err).slice(0, 500),
        });
      }
    }

    return outcome;
  });

  const emailSent = outcomes.filter((o) => o.emailSent).length;
  const emailFailed = outcomes.filter((o) => o.emailFailed).length;
  const pushSent = outcomes.filter((o) => o.pushSent).length;
  const pushFailed = outcomes.filter((o) => o.pushFailed).length;

  logEvent({
    type: 'broadcast_run',
    payload: {
      subject: trimmedSubject,
      targeted: recipientIdSet !== null,
      channels,
      recipientCount: users.length,
      emailSent,
      emailFailed,
      pushSent,
      pushFailed,
      duration_ms: Date.now() - startedAt,
    },
  });

  return {
    ok: true,
    channelsSent: channels,
    recipientCount: users.length,
    emailSent,
    emailFailed,
    pushSent,
  };
}

'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isAdminEmail } from '@/lib/admin';
import { notifyBroadcastByEmail } from '@/lib/email';
import { notifyBroadcastPush } from '@/lib/push';
import { logEvent } from '@/lib/analytics';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new Error('Not authorized');
  }
}

export type BroadcastResult =
  | { ok: true; recipientCount: number; emailSent: number; emailFailed: number; pushSent: number }
  | { ok: false; error: string };

// Admin-authored message either to every real signed-up user (recipientIds
// omitted) or to a specific hand-picked subset (recipientIds provided --
// the admin/broadcast page's "Specific users" mode), both channels
// independently (email via Resend to every real auth.users address, push
// via web-push to every push_subscriptions row) -- mirrors the existing
// per-user notification paths' "one channel's failure can't block the
// other, and one user's failure can't block the rest" pattern (see
// /api/poll's notifyWatchers), just fanned out to the target user set
// instead of one movie's watchers. Not logged through
// notification_deliveries (that table's movie_id/branch_id columns are
// NOT NULL, movie-shaped -- confirmed against the live schema before
// choosing this instead of a schema change): a broadcast summary is
// logged as one broadcast_run analytics_events row, the same "record a
// batch job's outcome" pattern every other scheduled job in this app
// already uses.
export async function sendBroadcast(
  subject: string,
  message: string,
  recipientIds?: string[],
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

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers();
  if (listError || !usersPage) {
    return { ok: false, error: `Couldn't list users: ${listError?.message ?? 'unknown error'}` };
  }
  const recipientIdSet = recipientIds ? new Set(recipientIds) : null;
  const users = usersPage.users
    .filter((u): u is typeof u & { email: string } => !!u.email)
    .filter((u) => !recipientIdSet || recipientIdSet.has(u.id));

  let emailSent = 0;
  let emailFailed = 0;
  let pushSent = 0;
  let pushFailed = 0;

  for (const user of users) {
    try {
      await notifyBroadcastByEmail(user.email, trimmedSubject, trimmedMessage);
      emailSent += 1;
    } catch {
      emailFailed += 1;
    }

    try {
      const sentCount = await notifyBroadcastPush(supabase, user.id, trimmedSubject, trimmedMessage);
      if (sentCount > 0) pushSent += 1;
    } catch {
      pushFailed += 1;
    }
  }

  logEvent({
    type: 'broadcast_run',
    payload: {
      subject: trimmedSubject,
      targeted: recipientIdSet !== null,
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
    recipientCount: users.length,
    emailSent,
    emailFailed,
    pushSent,
  };
}

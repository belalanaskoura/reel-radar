import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { notifyWelcomeByEmail } from '@/lib/email';
import { logEvent } from '@/lib/analytics';

// Delay before a fresh signup is eligible: long enough that they've had a
// real chance to see the push prompt on /notifications and decide either
// way, so the email's "notifications are on" vs "here's how to turn them
// on" branch reflects a real decision instead of catching everyone mid
// sign-up flow as "not enabled yet".
const WELCOME_DELAY_MS = 15 * 60 * 1000;
// Upper bound on how far back to look for un-welcomed users, so a long
// gap in the external scheduler doesn't turn into a scan of the entire
// user history every run.
const CANDIDATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Scheduled (cron-job.org) one-time welcome email for new signups -- see
// README's Scheduled Jobs section. Covers both signup paths (password and
// Google) since it works off auth.users' created_at rather than hooking
// the signup action itself, which has no reliable "is this a new user"
// signal for OAuth (see auth/callback/route.ts). Idempotency is a
// per-user 'welcome_email_sent' analytics_events row rather than a new
// DB column/table, since schema changes here go through Supabase's SQL
// editor directly (see README) and this app has no migration tooling.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  // listUsers() defaults to 50 users per page with no guaranteed sort
  // order exposed by the client -- can't assume newest-first and stop
  // early, so every page must be walked or signups past the first 50
  // users ever silently stop being scanned at all, with no error thrown
  // to surface it.
  const allUsers: User[] = [];
  let page = 1;
  for (;;) {
    const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) throw listError;
    allUsers.push(...usersPage.users);
    if (!usersPage.nextPage) break;
    page = usersPage.nextPage;
  }

  const now = Date.now();
  const candidates = allUsers.filter((u) => {
    if (!u.email) return false;
    const age = now - new Date(u.created_at).getTime();
    return age >= WELCOME_DELAY_MS && age <= CANDIDATE_WINDOW_MS;
  });

  let sent = 0;

  if (candidates.length > 0) {
    const { data: alreadySent } = await supabase
      .from('analytics_events')
      .select('payload')
      .eq('event_type', 'welcome_email_sent');
    const alreadySentIds = new Set(
      (alreadySent ?? [])
        .map((r) => (r.payload as { user_id?: string } | null)?.user_id)
        .filter((id): id is string => !!id),
    );

    const pending = candidates.filter((u) => !alreadySentIds.has(u.id));

    if (pending.length > 0) {
      const pendingIds = pending.map((u) => u.id);
      const [{ data: subs }, { data: profiles }] = await Promise.all([
        supabase.from('push_subscriptions').select('user_id').in('user_id', pendingIds),
        supabase.from('profiles').select('id, display_name').in('id', pendingIds),
      ]);
      const pushEnabledIds = new Set((subs ?? []).map((s) => s.user_id as string));
      const displayNameById = new Map(
        (profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]),
      );

      for (const user of pending) {
        const pushEnabled = pushEnabledIds.has(user.id);
        const displayName =
          displayNameById.get(user.id) ||
          (user.email ?? '')
            .split('@')[0]
            .replace(/[._-]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

        try {
          await notifyWelcomeByEmail(user.email!, { displayName, pushEnabled });
          await supabase
            .from('analytics_events')
            .insert({ event_type: 'welcome_email_sent', payload: { user_id: user.id, push_enabled: pushEnabled } });
          sent += 1;
        } catch {
          // best-effort -- no 'sent' row was written, so this user is
          // simply retried on the next run
        }
      }
    }
  }

  logEvent({
    type: 'welcome_email_run',
    payload: { candidates: candidates.length, sent, duration_ms: Date.now() - startedAt },
  });

  return NextResponse.json({ candidates: candidates.length, sent });
}

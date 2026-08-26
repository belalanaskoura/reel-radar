import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { listAllUsers } from '@/lib/list-all-users';
import { notifyWelcomeByEmail } from '@/lib/email';
import { logEvent } from '@/lib/analytics';
import { mapWithConcurrency } from '@/lib/concurrency';

// A slow sequential run is what caused the original duplicate-send
// incident described above (it's what let cron-job.org's 30s timeout
// trigger a retry in the first place) -- concurrency here directly
// shrinks that window. Safe under concurrency because the claim below is
// a real DB-level unique constraint, not an in-process check: two
// workers racing for the same user still resolve correctly at Postgres,
// regardless of how many run at once here.
const WELCOME_CONCURRENCY = 10;

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
// signal for OAuth (see auth/callback/route.ts).
//
// Idempotency is a real 'welcome_email_log' table with a UNIQUE
// constraint on user_id, claimed with an insert *before* the email is
// sent -- not a dedupe-then-send-then-mark read/write race. A slow run
// (the per-user loop is sequential, one Resend call at a time) can blow
// past cron-job.org's 30s job timeout; cron-job.org then retries, and
// the original invocation keeps running server-side even though the
// client gave up -- Vercel doesn't kill it. Two real invocations were
// then running the same candidate list concurrently. The old
// "read alreadySentIds once, send everyone not in it" approach let both
// invocations read the dedupe set before either one's writes landed,
// so both sent to the same users -- confirmed live: 18/18 users
// resent in a single run that also never logged a completion row
// (killed mid-run by the same timeout that triggered the retry),
// repeated 3 more times over 3 days. Claiming via a UNIQUE-constrained
// insert makes the race resolve at the database, not in application
// code: only one invocation's insert can win for a given user_id, and
// the loser gets a real 23505 back and skips sending, same pattern
// already used for cinema_follows/watchlist duplicate-insert races.
//
// welcome_email_log also carries an invocation_id (a fresh uuid per
// request) and every lost claim logs a 'welcome_email_claim_lost'
// analytics event -- so if a duplicate is ever reported again, it's a
// direct query away to tell whether it was two invocations racing for
// the same user (expected, harmless -- the loser's event will show up)
// or something outside this route's own protection entirely (e.g. two
// separate cron-job.org jobs configured against this endpoint), rather
// than reasoning about it from timestamps alone.
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const invocationId = crypto.randomUUID();
  const supabase = createServiceRoleClient();

  const allUsers = await listAllUsers(supabase);

  const now = Date.now();
  const candidates = allUsers.filter((u) => {
    if (!u.email) return false;
    const age = now - new Date(u.created_at).getTime();
    return age >= WELCOME_DELAY_MS && age <= CANDIDATE_WINDOW_MS;
  });

  let sent = 0;

  if (candidates.length > 0) {
    const { data: alreadySent } = await supabase.from('welcome_email_log').select('user_id');
    const alreadySentIds = new Set((alreadySent ?? []).map((r) => r.user_id as string));

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

      const results = await mapWithConcurrency(pending, WELCOME_CONCURRENCY, async (user) => {
        // Claim first: an insert that hits the unique constraint means
        // another (likely overlapping/retried) invocation already
        // claimed this user, so skip sending entirely rather than
        // risk a duplicate send.
        const { error: claimError } = await supabase
          .from('welcome_email_log')
          .insert({ user_id: user.id, invocation_id: invocationId });
        if (claimError) {
          if (claimError.code === '23505') {
            logEvent({
              type: 'welcome_email_claim_lost',
              payload: { user_id: user.id, invocation_id: invocationId },
            });
          } else {
            console.error('welcome_email_log claim failed', user.id, claimError);
          }
          return false;
        }

        const pushEnabled = pushEnabledIds.has(user.id);
        const displayName =
          displayNameById.get(user.id) ||
          (user.email ?? '')
            .split('@')[0]
            .replace(/[._-]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

        try {
          await notifyWelcomeByEmail(user.email!, { displayName, pushEnabled });
          return true;
        } catch {
          // Claim row stays -- a send failure here is rare enough
          // (vs. the routine "not eligible yet" case the claim exists
          // to prevent) that leaving this user unwelcomed is a smaller
          // risk than a duplicate send if it's retried.
          return false;
        }
      });

      sent = results.filter(Boolean).length;
    }
  }

  logEvent({
    type: 'welcome_email_run',
    payload: { invocation_id: invocationId, candidates: candidates.length, sent, duration_ms: Date.now() - startedAt },
  });

  return NextResponse.json({ candidates: candidates.length, sent });
}

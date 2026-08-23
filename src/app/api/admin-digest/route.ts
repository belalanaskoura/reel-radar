import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { listAllUsers } from '@/lib/list-all-users';
import { findDataQualityIssues } from '@/lib/matching/data-quality';
import { notifyAdminDigestByEmail } from '@/lib/email';
import { notifyAdminDigestPush } from '@/lib/push';
import { isAdminEmail } from '@/lib/admin';
import { logEvent } from '@/lib/analytics';

// Scheduled (cron-job.org, once daily -- see CLAUDE.md's scheduler
// section) digest of data-quality issues: movies with no poster, matched
// movies TMDB has no synopsis for, and movies stuck unmatched/ambiguous
// past a few days. Sends nothing when there's nothing to report, rather
// than a daily "all clear" email nobody wants. Both channels
// (email/push) are best-effort and independent -- one failing doesn't
// block the other, same as every other notification path in this app.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  // Only the no-overview check (a real per-movie TMDB call) is scoped by
  // this -- the no-poster/stuck-backlog checks scan the whole catalog
  // every run regardless, since those are plain, cheap column checks.
  // Falls back to 30 days ago on the very first run (no prior event to
  // read), rather than checking every matched movie ever.
  const { data: lastRun } = await supabase
    .from('analytics_events')
    .select('occurred_at')
    .eq('event_type', 'admin_digest_run')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sinceIso = lastRun?.occurred_at ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const issues = await findDataQualityIssues(supabase, sinceIso);

  let emailSent = false;
  let pushSent = 0;

  if (issues.length > 0) {
    try {
      await notifyAdminDigestByEmail(issues);
      emailSent = true;
    } catch {
      // best-effort, swallow and continue -- push is independent below
    }

    try {
      const adminEmails = (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim())
        .filter(isAdminEmail);
      const allUsers = await listAllUsers(supabase);
      const adminUserIds = allUsers
        .filter((u) => u.email && adminEmails.includes(u.email))
        .map((u) => u.id);

      for (const userId of adminUserIds) {
        pushSent += await notifyAdminDigestPush(supabase, userId, issues.length);
      }
    } catch {
      // best-effort, swallow -- email above already attempted independently
    }
  }

  logEvent({
    type: 'admin_digest_run',
    payload: { issues: issues.length, emailSent, pushSent, duration_ms: Date.now() - startedAt },
  });

  return NextResponse.json({ issues: issues.length, emailSent, pushSent });
}

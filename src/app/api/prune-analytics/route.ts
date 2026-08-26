import { NextResponse } from 'next/server';
import { verifySyncSecret } from '@/lib/verify-sync-secret';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { logEvent } from '@/lib/analytics';

// Scheduled (cron-job.org, recommend once daily) call to the
// prune_analytics_events() Postgres function (see
// supabase/schemas/public/functions/prune_analytics_events.sql). That
// function already existed -- added during the security-audit schema work
// specifically to keep analytics_events bounded against Supabase's 500MB
// free-tier storage cap (see src/lib/analytics.ts's own sampling comment)
// -- but nothing ever called it, so it was pure dead weight until this
// route. admin_digest_run/welcome_email_sent rows are excluded inside the
// function itself (real application state, not analytics, per that file's
// own SQL).
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();
  const keepDays = 90;

  const { data: deleted, error } = await supabase.rpc('prune_analytics_events', {
    p_keep_days: keepDays,
  });

  if (error) {
    console.error('prune_analytics_events failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logEvent({
    type: 'analytics_prune_run',
    payload: { deleted: deleted ?? 0, keepDays, duration_ms: Date.now() - startedAt },
  });

  return NextResponse.json({ deleted: deleted ?? 0 });
}

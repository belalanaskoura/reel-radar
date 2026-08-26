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
//
// Also prunes notification_deliveries (prune_notification_deliveries.sql)
// in the same run -- that table had no retention story at all until this,
// despite being the fastest-growing table in the schema (one row per user
// per channel per notification, fed by every notify path). Same
// "keep bounded rows bounded" job as the analytics prune, so it rides the
// same schedule instead of needing its own cron-job.org entry.
export async function POST(request: Request) {
  if (!verifySyncSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();
  const keepDays = 90;
  const deliveriesKeepDays = 180;

  const { data: deleted, error } = await supabase.rpc('prune_analytics_events', {
    p_keep_days: keepDays,
  });

  if (error) {
    console.error('prune_analytics_events failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: deliveriesDeleted, error: deliveriesError } = await supabase.rpc(
    'prune_notification_deliveries',
    { p_keep_days: deliveriesKeepDays },
  );

  if (deliveriesError) {
    // The analytics prune above already succeeded -- don't discard that
    // real result over this second, independent prune failing.
    console.error('prune_notification_deliveries failed:', deliveriesError.message);
  }

  logEvent({
    type: 'analytics_prune_run',
    payload: {
      deleted: deleted ?? 0,
      keepDays,
      deliveriesDeleted: deliveriesDeleted ?? 0,
      deliveriesKeepDays,
      duration_ms: Date.now() - startedAt,
    },
  });

  return NextResponse.json({
    deleted: deleted ?? 0,
    deliveriesDeleted: deliveriesDeleted ?? 0,
    deliveriesError: deliveriesError?.message ?? null,
  });
}

import { createServiceRoleClient } from '@/lib/supabase/service-role';

type AnalyticsEvent =
  | { type: 'page_view'; payload: { path: string; movie_id?: string; branch_id?: string } }
  | { type: 'signup'; payload: { user_id: string } }
  | { type: 'watchlist_add'; payload: { user_id: string; movie_id: string } }
  | { type: 'cinema_follow_add'; payload: { user_id: string; branch_id: string } }
  | {
      type: 'scrape_run';
      payload: {
        source: 'scene' | 'vox';
        branch: string;
        listed: number;
        bookable: number;
        delisted: number;
        duration_ms: number;
        error: string | null;
        // Only set for scene, which is now batched by offset (see
        // scrape-scene/route.ts) -- `listed` is the branch's FULL
        // listing count, `batchSize`/`offset` describe what this
        // specific run actually covered. Absent for vox (unbatched, one
        // run always covers the whole branch).
        batchSize?: number;
        offset?: number;
      };
    }
  | {
      type: 'poll_run';
      payload: { checked: number; notified: number; pair_errors: number; duration_ms: number };
    }
  | {
      type: 'match_run';
      payload: { matched: number; ambiguous: number; unmatched: number; merged: number; duration_ms: number };
    }
  | { type: 'sync_run'; payload: { accepted: number; rejected: number; duration_ms: number } }
  | {
      type: 'admin_digest_run';
      payload: { issues: number; emailSent: boolean; pushSent: number; duration_ms: number };
    }
  | {
      type: 'scrape_delist_run';
      payload: { branch: string; listed: number; delisted: number; duration_ms: number; error: string | null };
    }
  | {
      type: 'price_check_run';
      payload: {
        branch: string;
        format: string;
        matched: boolean | null; // null = the live price couldn't be verified this run, not a mismatch.
        templatePriceEgp: number;
        liveObservedPriceEgp: number | null;
        duration_ms: number;
      };
    }
  | {
      type: 'broadcast_run';
      payload: {
        subject: string;
        targeted: boolean; // true = sent to a hand-picked subset, not every user
        channels: ('email' | 'push')[];
        recipientCount: number;
        emailSent: number;
        emailFailed: number;
        pushSent: number;
        pushFailed: number;
        duration_ms: number;
      };
    }
  | {
      type: 'welcome_email_run';
      payload: { candidates: number; sent: number; duration_ms: number };
    }
  // Per-user idempotency record for the welcome email job (see
  // src/app/api/welcome-email/route.ts) -- there's no dedicated DB table
  // for "have we welcomed this user yet", so this reuses analytics_events
  // the same way admin-digest reuses it for its own last-run cursor.
  | {
      type: 'welcome_email_sent';
      payload: { user_id: string; push_enabled: boolean };
    };

// Fire-and-forget: analytics must never fail or slow down the request
// it's instrumenting, so errors are swallowed rather than surfaced.
export function logEvent(event: AnalyticsEvent) {
  createServiceRoleClient()
    .from('analytics_events')
    .insert({ event_type: event.type, payload: event.payload })
    .then(
      () => {},
      () => {},
    );
}

export function logPageView(path: string, extra?: { movie_id?: string; branch_id?: string }) {
  logEvent({ type: 'page_view', payload: { path, ...extra } });
}

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
      payload: {
        matched: number;
        ambiguous: number;
        unmatched: number;
        errored: number;
        merged: number;
        duration_ms: number;
        // Batched by offset since finding 3 of the reliability review
        // (see match-to-tmdb.ts's BATCH_SIZE comment) -- same shape as
        // scrape_run's own offset/batchSize/error fields.
        offset: number;
        batchSize?: number;
        error?: string | null;
      };
    }
  | {
      type: 'sync_run';
      payload: { accepted: number; rejected: number; duration_ms: number; error?: string | null };
    }
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
      payload: { invocation_id: string; candidates: number; sent: number; duration_ms: number };
    }
  | {
      type: 'welcome_email_claim_lost';
      payload: { user_id: string; invocation_id: string };
    }
  | {
      type: 'analytics_prune_run';
      payload: {
        deleted: number;
        keepDays: number;
        // notification_deliveries has no retention story of its own (see
        // prune_notification_deliveries.sql) -- pruned in the same run as
        // analytics_events rather than adding a second scheduled job for
        // what's conceptually the same "keep old rows bounded" task.
        deliveriesDeleted: number;
        deliveriesKeepDays: number;
        duration_ms: number;
      };
    }
  | {
      type: 'fanout_run';
      payload: {
        // Which notify function this call came from -- lets the
        // performance dashboard break duration/recipient count down per
        // fan-out path instead of lumping notifyWatchers,
        // notifyLineupAdditions/Removals, and notifyNewReleases together.
        kind: 'showtime' | 'lineup_added' | 'lineup_removed' | 'new_release';
        recipientCount: number;
        notified: number;
        duration_ms: number;
      };
    };

// Route params reach logPageView straight off the URL, so they're
// attacker-chosen on any public page. Both id shapes this app uses are
// narrow: movie ids are UUIDs, branch ids are short slugs from a fixed
// set. Anything else is dropped rather than written -- an unbounded
// attacker-controlled string has no business being persisted by a
// service-role client.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BRANCH_ID_RE = /^[a-z0-9_-]{1,32}$/i;

// Only this fraction of anonymous page views is recorded. Every view
// previously wrote a row through the service-role client with no rate
// limit and no bound, which on a 500 MB free tier is a cheap way for
// anyone to fill the database -- and the first symptom would have been
// writes to watchlist starting to fail. Sampling keeps the shape of the
// traffic without recording every hit; the other event types (signup,
// watchlist_add, the job runs) are all low-volume or authenticated and
// stay unsampled.
const PAGE_VIEW_SAMPLE_RATE = 0.1;

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
  if (Math.random() >= PAGE_VIEW_SAMPLE_RATE) return;

  const payload: { path: string; movie_id?: string; branch_id?: string } = { path };
  if (extra?.movie_id && UUID_RE.test(extra.movie_id)) payload.movie_id = extra.movie_id;
  if (extra?.branch_id && BRANCH_ID_RE.test(extra.branch_id)) payload.branch_id = extra.branch_id;

  logEvent({ type: 'page_view', payload });
}

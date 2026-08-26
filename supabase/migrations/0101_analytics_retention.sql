-- Retention for analytics_events.
--
-- The table had no bound at all: every anonymous page view wrote a row
-- through the service-role client. Sampling in src/lib/analytics.ts cuts
-- the inflow; this caps how long what does get written sticks around.
--
-- IMPORTANT: two event types are NOT analytics and must never be pruned.
-- This table is doing double duty as application state:
--
--   admin_digest_run    -- /api/admin-digest reads the most recent one as
--                          its "changed since" cursor. Deleting it makes
--                          the next run rescan a 30-day window.
--   welcome_email_sent  -- /api/welcome-email's per-user idempotency
--                          record. Deleting one re-sends that user their
--                          welcome email.
--
-- Both are cheap to keep forever. Everything else is genuinely
-- disposable reporting data.

create or replace function public.prune_analytics_events(p_keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.analytics_events
  where occurred_at < now() - make_interval(days => p_keep_days)
    and event_type not in ('admin_digest_run', 'welcome_email_sent');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_analytics_events(integer) from public, anon, authenticated;

-- The prune scans by age and the digest cursor reads by (event_type,
-- occurred_at desc); both want this.
create index if not exists analytics_events_type_occurred_at_idx
  on public.analytics_events (event_type, occurred_at desc);

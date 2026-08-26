-- Rate limiting backing store.
--
-- Postgres rather than Redis because this project already has Postgres and
-- adding a second datastore to a Hobby-tier deployment for one counter is
-- not worth it. An in-memory limiter would be worse than nothing here:
-- serverless functions don't share memory between instances, so a
-- per-instance counter silently multiplies the real limit by the instance
-- count.
--
-- Fixed-window rather than sliding-window: a fixed window can let through
-- up to 2x the limit across a window boundary, which is an acceptable
-- trade for a single-statement, lock-free check. If that ever matters,
-- the upgrade is a sliding window in this same function, not a schema
-- change.

create table if not exists public.rate_limits (
  key           text primary key,
  count         integer     not null default 0,
  window_start  timestamptz not null default now()
);

-- Written and read only by the service role (see src/lib/rate-limit.ts).
-- RLS on with no policy means no anon/authenticated access at all, which
-- is what we want -- a user must never be able to read or reset their own
-- counter.
alter table public.rate_limits enable row level security;

-- Atomic check-and-increment. Doing this as one statement in the database
-- rather than a read-then-write from the app is the whole point: two
-- concurrent requests reading a count of 4 against a limit of 5 would both
-- see room and both proceed.
--
-- Returns true when the request is ALLOWED, false when it should be
-- rejected. Callers that are over the limit still increment, so sustained
-- abuse keeps extending nothing -- the window expiry is wall-clock, not
-- last-attempt, which avoids a client being able to hold themselves in a
-- permanent lockout.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as rl (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set
      count = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
        else rl.window_start
      end
  returning rl.count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Housekeeping: rows for keys that stopped being hit are dead weight.
-- Call periodically from any scheduled job, or leave it -- the table stays
-- small in practice since keys are bounded by active IPs and user ids.
create or replace function public.prune_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;

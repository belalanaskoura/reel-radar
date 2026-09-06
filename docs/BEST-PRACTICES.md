# Reusable best practices from ReelRadar

A portable checklist of security, performance, scalability, and reliability
patterns implemented in this app, written so they can be copied into a new
Next.js + Postgres/Supabase project. Each item names the concrete pattern,
why it exists (the real bug/incident it closed, where known), and how to
adapt it generically. Source references point at this repo for when you
need the original implementation.

---

## 1. Security

### 1.1 Content-Security-Policy with a per-request nonce
Generate a fresh nonce per request, build CSP server-side, and set it on
the **request** headers in middleware (not just the response) so the
framework can stamp the nonce onto its own injected scripts.

```ts
// middleware/proxy
const nonce = crypto.randomUUID();
const csp = buildCsp(nonce, isDev);
request.headers.set('content-security-policy', csp);
```

- `script-src 'self' 'nonce-<nonce>' 'strict-dynamic'` (+ `'unsafe-eval'`
  only in dev, for hot-reload).
- `object-src 'none'`, `frame-ancestors 'none'`, `frame-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`.
- `style-src 'self' 'unsafe-inline'` is an accepted, documented concession
  for Tailwind/CSS-in-JS/inline font styles — not an oversight. Note it as
  such in a comment so a future audit doesn't "fix" it blindly.
- **Why it matters more than usual**: if your auth cookie can't be
  `httpOnly` (see 1.3), CSP is the primary thing standing between an XSS
  bug and full session theft. Treat CSP as load-bearing, not decorative.

Source: `src/lib/csp.ts`, `src/proxy.ts`.

### 1.2 Strip client-forgeable trust headers in middleware
If any internal header conveys authorization/identity between middleware
and downstream code (e.g. `x-admin-verified`), explicitly delete it from
the incoming request before your own middleware sets it — even if no
current code path would trust a forged one yet.

```ts
request.headers.delete(ADMIN_VERIFIED_HEADER);
```

Defense in depth: closes the hole permanently rather than relying on every
future handler to remember not to trust it.

Source: `src/proxy.ts`.

### 1.3 Auth cookie hardening when `httpOnly` isn't possible
If your auth flow (e.g. PKCE OAuth) requires client-side JS to read the
session cookie, you lose `httpOnly`. Compensate:
- `secure: true` in production explicitly — don't rely on library
  defaults, which may omit it.
- Shorten `maxAge` well below the library default (e.g. 30 days instead of
  400) since a stolen non-httpOnly cookie is a bigger blast radius.
- `SameSite=Lax` at minimum.
- Lean harder on CSP (1.1) and reauthentication-before-sensitive-changes
  (1.9) to compensate for the reduced cookie protection.

Source: `src/lib/supabase/cookie-options.ts`.

### 1.4 Separate client instances by trust level, never blur them
Maintain three distinct client constructors, each with a one-line comment
stating its trust boundary:
1. **Browser client** — anon key, RLS-enforced, cookie-scoped.
2. **Server/request client** — anon key, RLS-enforced, reads the request's
   cookies (so `auth.uid()` reflects the actual signed-in user).
3. **Service-role client** — bypasses RLS entirely. Comment it with "must
   never be imported into a client component" and construct it with
   `persistSession: false` since it's stateless per invocation.

Never let a single "supabase client" helper serve more than one of these
roles — the moment a service-role client is reachable from a code path
that also handles user input, an RLS bypass becomes reachable from the
outside.

Source: `src/lib/supabase/{client,server,service-role}.ts`.

### 1.5 Timing-safe, fail-closed secret verification
For any shared-secret-protected internal route (cron triggers, webhooks):

```ts
if (!expected) return false; // unset secret must never mean "open to everyone"
const a = sha256(provided);
const b = sha256(expected);
return timingSafeEqual(a, b); // hash first so lengths always match
```

- Fail closed on a missing/misconfigured secret — never let
  `undefined === undefined` become an accidental bypass.
- Hash both sides before `timingSafeEqual` so you avoid both the
  early-return-on-length-mismatch timing leak and a length-mismatch throw.

Source: `src/lib/verify-sync-secret.ts`.

### 1.6 Postgres-backed rate limiting, fail-open on infra failure
- Implement as one atomic `plpgsql` function (check-and-increment in a
  single statement) to avoid a read-then-write race between concurrent
  requests.
- Fixed window is an acceptable, simpler default; document the upgrade
  path to sliding window if you ever need it.
- The app-side wrapper should **fail open** (allow the request) if the DB
  call itself errors, but log it loudly — a rate-limiter outage should
  degrade to "no rate limiting," not "nobody can sign in."
- Key limits by account/user id where possible, not just IP — `IP` headers
  like `x-forwarded-for` are trivially spoofable off your edge/CDN.
- Apply it to: sign-in, sign-up, password reset, any "send email" action,
  file uploads, and any reauthentication check that itself accepts a
  password (see 1.9) — otherwise the reauth check becomes a new brute-force
  oracle.

Source: `src/lib/rate-limit.ts`, `supabase/schemas/.../functions/check_rate_limit.sql`.

### 1.7 Fixed, app-owned error codes for auth failures
Never render a raw query-string value or a raw provider error string
directly to the user.

```ts
// bad: <Banner>{searchParams.error}</Banner>  -> phishing/XSS-by-copy risk
// bad: <Banner>{supabaseError.message}</Banner> -> account-enumeration oracle
const code = parseAuthErrorCode(searchParams.error); // must match a known enum
<Banner>{AUTH_ERROR_MESSAGES[code]}</Banner>
```

This closes two distinct problems at once: an attacker can't craft a
`?error=` value that renders convincing arbitrary text on your real
domain, and your own auth provider's error text (which often reveals
"that email already exists" or similar) never reaches the client verbatim.
Centralize shared constants here too (e.g. minimum password length) so
validation doesn't drift across pages.

Source: `src/lib/auth-error-codes.ts`.

### 1.8 Two-tier admin authorization
Admin gate = allowlist **and** verified identity, not allowlist alone.

```ts
function isAdminUser(user) {
  if (!user?.email) return false;
  if (!user.email_confirmed_at) return false; // closes signup-as-someone-else
  return ADMIN_EMAILS.includes(user.email);
}
```

If email confirmation is ever disabled for local dev convenience, this
still holds — don't let an environment convenience toggle become a
privilege-escalation path in a misconfigured deploy.

Source: `src/lib/admin.ts`.

### 1.9 Cache expensive identity checks safely, if you must
If a per-request identity check (e.g. `getUser()` round-trip) is
measurably slow and hit on every navigation of a sensitive section:
- Cache the verified result in a **signed** cookie (HMAC, server-only
  secret), short TTL (e.g. 60s).
- Bind the cache to a hash of the actual auth cookies, not to time alone —
  sign-out/sign-in/token-refresh must invalidate it immediately, not wait
  out the TTL.
- Still re-check anything that can change independently of identity (e.g.
  an admin allowlist) even on a cache hit.
- Use Web Crypto (`crypto.subtle`) if this logic runs on an edge runtime
  where `node:crypto` isn't available.

Source: `src/lib/admin-session-cache.ts`.

### 1.10 Reauthenticate before destructive/credential-changing actions
Before allowing email or password changes, re-verify the current password
server-side (not just "are you logged in"):

```ts
async function verifyCurrentPassword(email, currentPassword, userId) {
  if (!currentPassword) return false;
  if (!(await checkRateLimit(`reauth:user:${userId}`, 5, 900))) return false;
  const { error } = await auth.signInWithPassword({ email, password: currentPassword });
  return !error;
}
```

Prevents a hijacked or borrowed session from turning into a permanent
account takeover. Rate-limit this check itself (see 1.6) so it can't
become a brute-force surface against an already-compromised session. For
email changes, prefer your provider's own confirm-by-click flow over
updating the email immediately.

Source: `src/app/account/actions.ts`.

### 1.11 Never trust client-declared file type — sniff magic bytes server-side
For any user upload (avatars, attachments):
- Do the upload through your own server route, not directly to storage
  from the client.
- Validate the real file type from its magic bytes (first few bytes of
  the buffer you actually received), not `file.type`/`file.name`.
- Check size against the buffer you received (`bytes.byteLength`), not a
  client-reported size.
- Derive the storage path from the authenticated user's server-side id —
  never accept a client-supplied path/filename.
- Still configure allowed-mime-types/size-limits at the storage-bucket
  level too — a caller can bypass your route entirely if they have a
  storage token.

The vulnerability this closes: a client-side upload trusting
`file.type`/`file.name` lets an attacker store an HTML file served back as
`text/html` from your own origin — a stored-XSS delivery path.

Source: `src/app/api/avatar/route.ts`.

### 1.12 Standard security headers, plus a locked-down image-optimizer CSP
```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: <restrictive>
```
Skip `preload` on HSTS deliberately — it's effectively irreversible across
browsers once submitted. If you enable `dangerouslyAllowSVG` for local,
first-party images, pair it with `contentDispositionType: 'attachment'`
and a scoped `Content-Security-Policy: default-src 'self'; script-src
'none'; sandbox;` on the optimizer's own responses — never enable it for
remote/user-supplied SVGs.

Source: `next.config.ts`.

### 1.13 Weekly scheduled static analysis, independent of pushes
Run CodeQL (or equivalent) on push/PR **and** on a standalone weekly cron.
A newly-disclosed CVE in an already-merged dependency needs a detection
path even in a week with zero commits.

Source: `.github/workflows/codeql.yml`.

---

## 2. Performance

### 2.1 A single bounded-concurrency helper, reused everywhere
```ts
async function mapWithConcurrency<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}
```
Avoid both failure modes: fully sequential loops over N external calls
(notifications, scraping, emails) blow past serverless function timeouts
as N grows; fully unbounded `Promise.all` risks hammering a third-party
API or your own DB with a connection-count spike. Pick a concurrency
constant (e.g. 10) per call site based on what's on the other end. Extract
this helper the first time you write the same worker-pool loop a second
time — don't build it speculatively before that.

Source: `src/lib/concurrency.ts`.

### 2.2 Same-origin proxy for third-party images your optimizer can't reach
If an image host blocks your hosting provider's IP range (common with
Cloudflare-fronted sites blocking Vercel), don't fight it — route those
specific images through your own `/api/image-proxy` route so the
optimizer only ever talks to itself. Match the affected hosts by suffix so
new subdomains/branches don't need code changes.

Source: `src/lib/tmdb-image.ts`, `src/app/api/scene-poster/route.ts`.

### 2.3 Scope `remotePatterns` narrowly, and expect redirect targets to need their own entry
List exact path prefixes per external image host, not whole-domain
wildcards. When a host 302-redirects images to a different subdomain,
that target host needs its own explicit `remotePatterns` entry — the
optimizer refuses to follow a redirect to an unlisted host, and this
often only surfaces in production (`next start`/deployed), not in `next
dev`, which skips the strict check.

Source: `next.config.ts`.

### 2.4 Cache expensive external reads in your own table, keyed by the shared resource — not per user
```sql
create table resource_cache (
  resource_id text not null,
  variant_id  text not null,
  data        jsonb,
  primary key (resource_id, variant_id)
);
```
Every page read hits this cache (readable by all via RLS `using (true)`
for public data); nothing user-facing ever triggers a live fetch of the
underlying slow/rate-limited resource. This is the foundation the
scalability pattern in 3.1 depends on — get the cache shape right first.

Source: `showtimes_cache` in `supabase/schemas/public/tables/`.

### 2.5 Rate-limit yourself against third parties you scrape/call repeatedt
Add a deliberate delay between requests to any site you poll, and tune it
against your actual timeout budget, not a guess: measure real end-to-end
duration at a few delay values and pick the smallest delay that still
finishes comfortably inside your caller's timeout (e.g. an external
scheduler's job timeout). Document the measured numbers in a comment so
the next person doesn't re-derive them.

Source: `src/lib/scene/fetcher.ts` (`REQUEST_DELAY_MS`).

### 2.6 Client-side filtering: `useMemo`, not debounce, when data's already in memory
If a page ships its full dataset once and then supports live search over
it, filter with `useMemo` on every keystroke — there's no network call to
debounce. Only add a debounce around a genuine network-triggered fallback
path (e.g. "found nothing locally, ask the server for the full catalog"),
and say so in a comment, since a debounce next to non-debounced filtering
otherwise looks like an inconsistency. Prefer word-prefix matching over
naive substring search to avoid short-query false positives (e.g. "i"
matching "Obsession").

Source: `src/components/BrowseGrid.tsx`.

---

## 3. Scalability

### 3.1 Poll/compute once per shared resource, never once per user
The central scaling rule: if N users care about the same external state
(a showtime, a price, a feed), your backend must do O(distinct resources)
work per cycle, not O(users). Structure the cache table's primary key
around the resource (see 2.4), and derive the worklist for your polling
job from `select distinct resource_id from watchlist`, not from a
per-user loop.

Source: `src/app/api/poll/route.ts`.

### 3.2 Isolate errors per unit of work inside a batch job
Wrap each independent item (each movie×branch pair, each user in a
fan-out) in its own try/catch inside the loop. One item's failure should
increment an error counter and continue, never abort the whole run.

Source: `src/app/api/poll/route.ts`.

### 3.3 Fan out notifications with bounded concurrency and independent channels
- Use the concurrency helper (2.1) for the outer loop over recipients.
- Make each notification channel (email, push, SMS, in-app) its own
  try/catch — one channel failing for one user must never block or abort
  another channel or another user.
- Deduplicate sends by pre-loading an already-notified set once per run
  (a single query into a `Set`), not with a per-recipient existence query.
- Log a per-batch metric (recipient count, duration) separate from the
  overall job metric, so a concurrency fix's effect is measurable on its
  own.

Source: `src/app/api/poll/route.ts`.

### 3.4 Always paginate admin/bulk listing calls — never trust a default page size
```ts
async function listAllUsers(supabase) {
  const all = [];
  let page = 1;
  for (;;) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    all.push(...data.users);
    if (!data.nextPage) break;
    page = data.nextPage;
  }
  return all;
}
```
A default-paged admin API (often 50/page) silently truncates once you
cross that threshold, usually without throwing — meaning the bug can ship
unnoticed until the user base grows past it. Extract this into one shared
helper the moment a second call site needs "all of X," so the fix can't
regress at individual call sites.

Source: `src/lib/list-all-users.ts`.

### 3.5 Enforce uniqueness in the database, and treat the resulting error as an expected outcome
For any "find-or-create" pattern reachable from more than one concurrent
job run (overlapping scheduled scrapes, retried webhooks):
- Add the real `UNIQUE` constraint at the DB level — a plain
  `SELECT`-then-`INSERT` in application code is a race no amount of
  careful ordering fixes.
- Handle the resulting unique-violation error code (e.g. Postgres
  `23505`) as a normal, expected branch: re-query for the row that won,
  and clean up your own losing attempt only if you can prove you created
  it (e.g. an `ownsFreshPlaceholder` flag from the insert's own return
  value) — never delete a row you didn't just create.
- Exclude `NULL` from the uniqueness check if some legitimate rows
  intentionally have no value for that column yet.

Source: `movie_branch_slugs (branch_id, slug)` unique constraint,
`movies.normalized_title` unique index, both in
`supabase/schemas/public/tables/` with handling in
`src/app/api/scrape-scene/route.ts`.

### 3.6 Add indexes ahead of pain for columns hit by every scheduled job
If a query shape runs unconditionally on every cron/scheduled invocation
(not just on-demand user traffic), index its filter/join columns even if
current row counts don't yet show it in a slow-query log — the cost of
scheduled-job queries compounds silently since nobody's watching a
loading spinner for them.

Source: `supabase/migrations/*_scale_indexes.sql`.

### 3.7 Batch long-running scheduled jobs against your scheduler's real timeout
If an external scheduler enforces a hard timeout (e.g. 30s), don't assume
your job's dataset stays small — batch by offset (`?offset=&limit=`) and
have the scheduler call the route multiple times per sweep, rather than
relying on a "small enough for now" assumption that will eventually
regress. A job killed mid-run by a scheduler-side timeout typically
leaves **no log entry at all** (it never reaches its own completion
logging) — if you see unexplained gaps in a job's history, suspect this
before anything else. Keep genuinely different operations (e.g. "sync
new/changed items" vs. "detect removed items") as separate jobs rather
than one growing job, since detecting removals usually needs the complete
listing in hand at once, which resists batching.

Source: `src/app/api/scrape-scene/route.ts`, `scrape-scene-delist`.

---

## 4. Design / Reliability

### 4.1 One root error boundary is enough until proven otherwise
Start with a single `error.tsx` at the root — a good generic "something
went wrong, try again / go home" fallback covers every route without
per-segment duplication. Add nested, route-specific boundaries later only
once a specific route actually needs different recovery behavior than the
generic case.

### 4.2 A separate `global-error.tsx` backstop for the root layout itself
A route-level error boundary sits *inside* the root layout, so it can't
catch an error thrown by the layout itself (e.g. a failed session check
that runs on every page). Add the framework's dedicated top-level error
boundary for this case. It typically must render its own full document
shell (can't reuse the layout that just failed), so keep its styling
minimal and hardcoded rather than pulling in your design system.

### 4.3 A narrow, unauthenticated health check
Expose `/api/health` without any auth so external uptime monitors need no
credential. Check only the one dependency every page truly can't function
without (e.g. a single trivial DB round trip) — deliberately skip
checking every downstream integration (email provider, third-party APIs)
your app already degrades gracefully without. Without this, an outage's
first signal is often just "a user complained" or "the scheduled jobs
went quiet and nobody noticed."

### 4.4 Timeout-wrap and try/catch any identity/session check on the hot path
A per-request auth check (e.g. `getUser()`) that runs on every single page
load is a sitewide single point of failure the moment the auth provider
has a slow (not even fully down) blip.
```ts
function fetchWithTimeout(input, init) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8_000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}
```
Override the client's fetch to enforce a hard timeout if the SDK doesn't
expose one directly, wrap the call itself in try/catch, and fall back to
"treat as signed out" on any failure — every page should already handle
that state. Tag each call site's error log distinctly (e.g.
`'RootLayout.getUser'`) so failures are traceable to where they occurred,
not just that "some auth call failed somewhere."

### 4.5 CI hardening checklist
See section 5 for the full CI/CD checklist (SHA-pinning, least-privilege
permissions, caching, secret-aware degraded builds, deploy-gated smoke
tests, weekly static analysis).

---

## 5. CI/CD

### 5.1 One workflow per concern, gated by path
Split CI into separate workflow files rather than one monolithic
pipeline, and gate expensive ones (schema checks, smoke tests) to only
the paths that can actually trigger them:
```yaml
on:
  push:
    branches: [main]
    paths: ['supabase/schemas/**', 'supabase/config.toml', 'supabase/migrations/**']
```
A typical split: `ci.yml` (lint/test/build on every push+PR to main),
`codeql.yml` (security scanning, push/PR + weekly cron), a deploy-gated
smoke test, a schema-plan/apply pipeline, and dependency-update
automation. Each one independently readable, independently debuggable
via `gh run list`, and independently fixable without risking the others.

### 5.2 Pin every third-party Action to a commit SHA, not a tag
```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
- uses: github/codeql-action/analyze@5ba2889ada762081db2c4f32a729827dce632c7b # v3
```
Tags are mutable and can be repointed (accidentally or maliciously) by
the action's maintainer; a commit SHA can't be. Keep the human-readable
version as a trailing comment so upgrades stay easy to reason about and
diff.

### 5.3 Declare least-privilege `permissions:` on every workflow
```yaml
permissions:
  contents: read
```
Set this explicitly at the workflow (or job) level rather than relying on
the repository default, which is often broader than any given job needs.
Widen only for the specific job that needs it and only to the specific
scope it needs — e.g. CodeQL's upload step needs `security-events: write`
but nothing else in that workflow does.

### 5.4 Cache build output keyed on lockfile + branch, with fallback tiers
```yaml
key: nextjs-${{ hashFiles('package-lock.json') }}-${{ github.ref_name }}
restore-keys: |
  nextjs-${{ hashFiles('package-lock.json') }}-
  nextjs-
```
Scoping the primary key to both the lockfile hash and the branch name
avoids a subtly-wrong build: reusing a cache built on a divergent branch
can produce incorrect incremental output that a from-scratch build
wouldn't. The fallback tiers still give a real speed win on a brand-new
branch or after a dependency bump, just with a slightly less exact cache
hit.

### 5.5 Let the build double as the typecheck step, if your framework generates types at build time
If your framework only writes certain generated types during a real build
(e.g. Next.js route-typing globals that only exist after `.next/types` is
written), a standalone `tsc --noEmit` run on a clean checkout will fail
even on correct code. Don't fight this — treat the build itself as the
typecheck gate and drop the separate step, rather than hand-rolling a
partial type-generation step just to satisfy a standalone typecheck.

### 5.6 Design the build to succeed in a degraded mode with no secrets
Dependency-update bots (Dependabot, Renovate) typically never receive
repository secrets, by the platform's own design — a PR from one of them
must still pass CI. If part of your build calls an external service at
build time (e.g. a statically-prerendered page hitting your DB), make
that call conditional on the relevant env var actually being present, so
a secrets-less build degrades to "skip this step" rather than throwing.
Conversely, when secrets **are** available (pushes to `main`, PRs from
trusted branches), pass them through so the full path — including the
part that only works with real credentials — is genuinely exercised at
least once per merge, not just skipped forever.

### 5.7 Gate deploy-time smoke tests on the platform's real success event
```yaml
on:
  deployment_status:
jobs:
  smoke:
    if: github.event.deployment_status.state == 'success' && github.event.deployment_status.environment == 'Preview'
```
Trigger a post-deploy smoke test off your host's actual
deployment-succeeded webhook/event (Vercel's `deployment_status`,
similar on other platforms), not a fixed `sleep N` guessing when the
deploy will be ready — that either wastes CI minutes waiting too long or
flakes by testing a URL that isn't live yet. Keep the smoke test itself
deliberately small: load the couple of pages that represent "the site is
up and not throwing," not a full end-to-end suite — a separate, slower
suite is the right place for real user-flow coverage.

### 5.8 Run static analysis on a standalone weekly cron, independent of pushes
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'
```
A newly-disclosed CVE in a dependency you haven't touched still needs a
detection path during a quiet week with zero commits — the scheduled run
covers that gap that push/PR triggers alone can't.

### 5.9 Document exactly which secrets/variables CI needs, and why each one is safe to give it
Keep an explicit, current list (in the workflow file's comments or a
CLAUDE.md/README) of every secret and variable a workflow consumes, plus
why a read-only/build-time value is an acceptable thing to hand to CI
(e.g. "these are the same values as production's read-only public/anon
keys — this job never writes"). This makes a "why is CI failing" incident
resolvable in minutes: check `gh secret list`/`gh variable list` against
the documented list first, before diving into logs. A misconfigured or
never-set secret is a common, boring root cause worth ruling out
immediately, not last.

### 5.10 A declarative schema pipeline: plan on PR, apply only after human merge
For any project where schema changes are risky enough to deserve review
(not just app code), don't let CI push schema changes straight to
production on green. A safer shape:
- Schema is defined declaratively in version-controlled files (not
  hand-run SQL), diffed against migration history to produce real
  migration files.
- On a **PR**, a `plan` job diffs the declared schema against the real
  linked database and posts the pending SQL as a **read-only preview** in
  the PR — nothing is written.
- On a **push to the default branch**, an `apply` job diffs against a
  local shadow database (rebuilt by replaying existing migrations). If
  that produces a new migration file, the workflow commits it to a new
  branch and **opens a PR** for a human to merge — it does not push
  directly, and branch protection on the default branch should reject a
  same-run bot push anyway. Only once that generated-migration PR is
  actually merged does a subsequent run apply it for real.
- End state: there is no fully-automatic, unreviewed path from a schema
  edit to production — every real schema change lands as a PR a human
  merges, and only the run triggered by *that* merge executes the actual
  apply/push.

### 5.11 Automate dependency updates, capped and separated by ecosystem
```yaml
updates:
  - package-ecosystem: npm
    schedule: { interval: weekly }
    open-pull-requests-limit: 10
  - package-ecosystem: github-actions
    schedule: { interval: weekly }
    open-pull-requests-limit: 10
```
Update both application dependencies and the CI Actions themselves on a
schedule (weekly is a reasonable default), and cap open PRs so a
dependency-heavy week doesn't flood the PR list. This is also what makes
5.6 (degraded builds without secrets) necessary in the first place —
these bot-authored PRs are exactly the ones that won't have secrets.

---

## How to adapt this into a new project

1. Start with 1.4 (client separation) and 2.4/3.1 (shared-resource
   caching) — these are the architectural decisions everything else
   builds on; retrofitting them later is expensive.
2. Add 1.1–1.3 and 1.12 (CSP, cookies, headers) as soon as auth exists,
   before real user data does.
3. Add 3.5 (DB uniqueness + race handling) the first time you have any
   scheduled/concurrent job that can run overlapping instances — don't
   wait for the duplicate-row incident to prove it's needed.
4. Add 2.1 (bounded concurrency) and 3.3 (fan-out isolation) the first
   time a loop's iteration count depends on user-controlled growth
   (notification recipients, scraped items, bulk emails).
5. Everything under section 4 is cheap to add early and expensive to
   retrofit after a real outage — do it in the same pass as initial
   deployment setup, not as a later hardening pass.
6. Set up section 5's CI basics (5.1–5.4, 5.9) on day one, alongside the
   very first workflow file — they cost nothing extra to do right from
   the start. Add 5.10 (the plan/apply schema pipeline) only once schema
   changes are actually happening regularly enough to justify the setup
   cost; a brand-new project can defer it.

# Security policy

ReelRadar is a solo side project with a live production deployment and
real user accounts. If you find a security issue, please report it
privately rather than opening a public issue.

## Reporting a vulnerability

Email **belalhamada489@gmail.com** with a description of the issue, steps
to reproduce, and its potential impact. You should get a response within
a few days.

Please don't:

- Open a public GitHub issue for a security report.
- Test against production data beyond what's needed to demonstrate the
  issue (no bulk data extraction, no account takeover attempts against
  real users, no denial-of-service testing).
- Access, modify, or delete data that isn't yours.

## Scope

In scope: anything in this repository, and the deployment at
reelradar.online.

Not currently in scope: third-party services this app depends on (Scene
Cinemas, elCinema, TMDB, Supabase, Resend, Vercel) -- report issues in
those directly to their own teams.

## Disclosure

There's no bug bounty. Credit in the fix's commit message (if you'd
like it) is the extent of the reward, but reports are taken seriously
and fixed promptly.

import Link from 'next/link';
import { RadarLogo } from '@/components/RadarLogo';

// Site-wide footer (previously landing-page-only, see git history) --
// promoted here so it renders on every route via layout.tsx, which is
// what TMDB's API terms actually require: a visible attribution notice
// on every page that displays their data (posters/synopses/ratings show
// up on /browse, /watchlist, and movie detail pages too, not just the
// landing page). This also gives every other route the Legal links the
// landing page already had, rather than /privacy /terms /cookies only
// being reachable from / and /signup.
export function SiteFooter() {
  return (
    <footer
      className="border-t"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <RadarLogo size={24} />
              <p className="font-display text-xl tracking-wider" style={{ color: 'var(--ink)' }}>
                REELRADAR
              </p>
            </div>
            <p className="max-w-xs text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
              Cinematic exploration in the heart of Cairo. Track, discover, and experience the
              silver screen like never before.
            </p>
          </div>
          <div>
            <p
              className="mb-3 text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: 'var(--accent-dim)' }}
            >
              Explore
            </p>
            <ul className="flex flex-col gap-2">
              {[
                ['Movies', '/browse'],
                ['Cinemas', '/cinemas'],
                ['Watchlist', '/watchlist'],
              ].map(([label, href]) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-xs transition-opacity hover:opacity-70"
                    style={{ color: 'var(--ink-dim)' }}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p
              className="mb-3 text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: 'var(--accent-dim)' }}
            >
              Legal
            </p>
            <ul className="flex flex-col gap-2">
              {[
                ['Privacy', '/privacy'],
                ['Terms', '/terms'],
                ['Cookies', '/cookies'],
              ].map(([label, href]) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-xs transition-opacity hover:opacity-70"
                    style={{ color: 'var(--ink-dim)' }}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          className="mt-10 flex flex-col items-center gap-2 border-t pt-6 text-center text-[10px] tracking-widest uppercase"
          style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
        >
          <p>© 2026 REELRADAR. ALL RIGHTS RESERVED.</p>
          {/* Required by TMDB's API terms of use: a visible attribution
              notice on every page displaying TMDB-sourced data (posters,
              synopses, ratings), not just a mention buried in the privacy
              policy. Normal-case, not all-caps, since TMDB's own
              attribution guidelines specify this exact sentence verbatim. */}
          <p className="normal-case">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </div>
      </div>
    </footer>
  );
}

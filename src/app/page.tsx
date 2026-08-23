import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { posterUrl } from '@/lib/tmdb-image';
import { RadarLogo } from '@/components/RadarLogo';
import { logPageView } from '@/lib/analytics';
import { hidePosterlessMovies } from '@/lib/movie-visibility';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  logPageView('/');

  if (user) redirect('/browse');

  // Fetch trending: bookable movies first (sorted by most bookable days),
  // then fill with upcoming — gives a live "what's on right now" feel.
  const { data: movies } = await supabase
    .from('movies')
    .select('id, title, release_date, poster_path, showtimes_cache(bookable, raw_showtimes)')
    .eq('match_status', 'matched')
    .order('release_date', { ascending: true, nullsFirst: false })
    .limit(20);

  const hidePosterless = hidePosterlessMovies();
  const withPosters = (movies ?? []).filter((m) => !hidePosterless || m.poster_path);

  // Sort: bookable (most days) → coming soon
  const sorted = withPosters.sort((a, b) => {
    const aDays = (a.showtimes_cache ?? []).reduce(
      (sum, s) => sum + (s.bookable && Array.isArray(s.raw_showtimes) ? s.raw_showtimes.length : 0),
      0,
    );
    const bDays = (b.showtimes_cache ?? []).reduce(
      (sum, s) => sum + (s.bookable && Array.isArray(s.raw_showtimes) ? s.raw_showtimes.length : 0),
      0,
    );
    return bDays - aDays;
  });

  const trending = sorted.slice(0, 3);

  return (
    <main style={{ background: 'var(--bg)' }}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 100% 80% at 50% -5%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%)',
          }}
        />

        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-36">
          {/* Live pill */}
          <div
            className="mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium tracking-widest uppercase"
            style={{ borderColor: 'var(--rule)', background: 'var(--surface)', color: 'var(--accent-dim)' }}
          >
            Cairo Cinema Updates
          </div>

          {/* Headline */}
          <h1 className="font-display mb-6 leading-none" style={{ color: 'var(--ink)' }}>
            <span className="block text-6xl sm:text-8xl lg:text-[110px]">NEVER MISS A</span>
            <span
              className="block text-6xl sm:text-8xl lg:text-[110px]"
              style={{ color: 'var(--accent)' }}
            >
              PREMIERE
            </span>
          </h1>

          <p
            className="mb-10 max-w-lg text-base leading-relaxed sm:text-lg"
            style={{ color: 'var(--ink-dim)' }}
          >
            Track upcoming releases across Cairo cinemas, watchlist the ones
            you care about, and get notified the second booking opens.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold tracking-wide transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              START YOUR WATCHLIST
              <ArrowRight />
            </Link>
            <Link
              href="/cinemas"
              className="inline-flex items-center gap-2 rounded-sm border px-6 py-3 text-sm font-semibold tracking-wide transition-opacity hover:opacity-80"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink)', background: 'var(--surface)' }}
            >
              BROWSE CINEMAS
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trending in Cairo ─────────────────────────────────────────── */}
      <section
        className="py-16 sm:py-20"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2
                className="font-display text-4xl leading-none sm:text-5xl"
                style={{ color: 'var(--ink)' }}
              >
                TRENDING IN CAIRO
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-dim)' }}>
                The most anticipated films playing right now.
              </p>
            </div>
            <Link
              href="/browse"
              className="hidden shrink-0 text-xs font-semibold tracking-widest uppercase transition-opacity hover:opacity-70 sm:inline-flex sm:items-center sm:gap-1"
              style={{ color: 'var(--accent-dim)' }}
            >
              VIEW ALL
              <ArrowRight size={12} />
            </Link>
          </div>

          {trending.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {trending.map((movie) => {
                const isBookable = (movie.showtimes_cache ?? []).some((s) => s.bookable);
                const poster = posterUrl(movie.poster_path, 'w500');
                return (
                  <TrendingCard
                    key={movie.id}
                    id={movie.id}
                    title={movie.title}
                    releaseDate={movie.release_date}
                    poster={poster}
                    isBookable={isBookable}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
              Check back soon. Catalog updates daily.
            </p>
          )}

          <div className="mt-6 sm:hidden">
            <Link
              href="/browse"
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: 'var(--accent-dim)' }}
            >
              VIEW ALL RELEASES →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stay in the loop CTA ──────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2
            className="font-display mb-4 text-4xl leading-none sm:text-6xl"
            style={{ color: 'var(--ink)' }}
          >
            STAY IN THE
            <br />
            <span style={{ color: 'var(--accent)' }}>DARK ROOM</span>
          </h2>
          <p className="mb-10 text-sm leading-relaxed sm:text-base" style={{ color: 'var(--ink-dim)' }}>
            Create a free account to watchlist upcoming films and receive
            instant push notifications the moment booking opens. No
            refreshing cinema sites, no missed premieres.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold tracking-wide transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              CREATE FREE ACCOUNT
              <ArrowRight />
            </Link>
            <Link
              href="/browse"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: 'var(--ink-dim)' }}
            >
              Or browse without signing up
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer
        className="border-t"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-2">
              <div className="mb-2 flex items-center gap-2">
                <RadarLogo size={24} />
                <p
                  className="font-display text-xl tracking-wider"
                  style={{ color: 'var(--ink)' }}
                >
                  REELRADAR
                </p>
              </div>
              <p className="max-w-xs text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
                Cinematic exploration in the heart of Cairo. Track, discover, and
                experience the silver screen like never before.
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
                {[['Movies', '/browse'], ['Cinemas', '/cinemas'], ['Watchlist', '/watchlist']].map(
                  ([label, href]) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="text-xs transition-opacity hover:opacity-70"
                        style={{ color: 'var(--ink-dim)' }}
                      >
                        {label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
          <div
            className="mt-10 border-t pt-6 text-center text-[10px] tracking-widest uppercase"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
          >
            © 2026 REELRADAR. ALL RIGHTS RESERVED.
          </div>
        </div>
      </footer>
    </main>
  );
}

function TrendingCard({
  id,
  title,
  releaseDate,
  poster,
  isBookable,
}: {
  id: string;
  title: string;
  releaseDate: string | null;
  poster: string | null;
  isBookable: boolean;
}) {
  const dateLabel = releaseDate
    ? new Date(releaseDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Link
      href={`/movies/${id}`}
      className="poster-card group relative flex aspect-[2/3] overflow-hidden rounded-sm"
      style={{ background: 'var(--surface)' }}
    >
      {poster && (
        <Image
          src={poster}
          alt={title}
          fill
          sizes="(max-width: 640px) 100vw, 33vw"
          unoptimized
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}

      {/* Gradient overlay -- deliberately a fixed dark scrim, not theme-
          derived: it sits over a photographic poster to keep the white
          title/date text readable, not over page background, so it should
          not flip to a light tint in light mode. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.35) 50%, transparent 100%)',
        }}
      />

      {/* Status badge top-right */}
      <div className="absolute top-3 right-3">
        <span
          className="rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase"
          style={
            isBookable
              ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
              : { background: 'rgba(29,32,32,0.85)', color: 'var(--accent-dim)', border: '1px solid var(--rule)' }
          }
        >
          {isBookable ? 'BOOKING OPEN' : 'COMING SOON'}
        </span>
      </div>

      {/* Info at bottom */}
      <div className="absolute right-0 bottom-0 left-0 p-4">
        <h3
          className="font-display mb-1 text-2xl leading-tight"
          style={{ color: '#ffffff' }}
        >
          {title}
        </h3>
        {dateLabel && (
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {isBookable ? `Now playing, ${dateLabel}` : dateLabel}
          </p>
        )}
      </div>
    </Link>
  );
}

function ArrowRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

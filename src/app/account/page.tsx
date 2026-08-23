import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { posterUrl } from '@/lib/tmdb-image';
import { signout } from '../signin/actions';
import { AvatarUpload } from '@/components/AvatarUpload';
import { ArrowRightIcon, BookmarkIcon, SettingsIcon, SignOutIcon, FilmIcon, MessageIcon } from '@/components/icons';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const [profileResult, countResult, recentResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('avatar_url, display_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('watchlist')
      .select('movie_id, movies(id, title, poster_path, release_date, showtimes_cache(bookable))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const profile = profileResult.data;
  const watchlistCount = countResult.count ?? 0;

  type RecentMovie = {
    id: string;
    title: string;
    poster_path: string | null;
    release_date: string | null;
    bookable: boolean;
  };

  const recentMovies: RecentMovie[] = (recentResult.data ?? []).flatMap((row) => {
    const m = row.movies as unknown as {
      id: string;
      title: string;
      poster_path: string | null;
      release_date: string | null;
      showtimes_cache: { bookable: boolean }[];
    } | null;
    if (!m) return [];
    return [{
      id: m.id,
      title: m.title,
      poster_path: m.poster_path,
      release_date: m.release_date,
      bookable: (m.showtimes_cache ?? []).some((s) => s.bookable),
    }];
  });

  const displayName = profile?.display_name || (user.email ?? '')
    .split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <main className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">

      {/* Flash messages */}
      {error && (
        <div className="mb-6">
          <p role="alert" className="flash-message rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}>
            {error}
          </p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">

        {/* ── Left: Identity + account controls ──────────────────────── */}
        <aside className="flex flex-col gap-4">
          <AvatarUpload
            userId={user.id}
            avatarUrl={profile?.avatar_url ?? null}
            size={120}
            shape="square"
          />

          <div>
            <h1
              className="font-display text-3xl leading-none tracking-wide"
              style={{ color: 'var(--ink)' }}
            >
              {displayName}
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-dim)' }}>
              {user.email}
            </p>
          </div>

          {/* Watchlist — prominent link, not just a stat */}
          <Link
            href="/watchlist"
            className="flex items-center justify-between rounded-sm border px-3 py-3 transition-[opacity,transform] duration-150 ease-out hover:opacity-80 active:scale-[0.98]"
            style={{ borderColor: 'var(--accent)', background: 'var(--ok-bg)' }}
          >
            <div className="flex items-center gap-2.5">
              <BookmarkIcon size={18} style={{ color: 'var(--accent)' }} />
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
                  Watchlist
                </p>
                <p className="font-display text-2xl leading-none mt-0.5" style={{ color: 'var(--ink)' }}>
                  {watchlistCount}
                </p>
              </div>
            </div>
            <ArrowRightIcon size={16} style={{ color: 'var(--accent)' }} />
          </Link>

          {/* Settings -- identity fields, notifications, appearance,
              security all now live on /account/edit rather than being
              split across this page and that one. */}
          <Link
            href="/account/edit"
            className="flex items-center justify-center gap-2 rounded-sm border py-2.5 text-sm font-semibold tracking-wide transition-[opacity,transform] duration-150 ease-out hover:opacity-80 active:scale-[0.98]"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <SettingsIcon size={15} />
            Settings
          </Link>

          <Link
            href="/feedback"
            className="flex items-center justify-center gap-2 rounded-sm border py-2.5 text-sm font-semibold tracking-wide transition-[opacity,transform] duration-150 ease-out hover:opacity-80 active:scale-[0.98]"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
          >
            <MessageIcon size={15} />
            Send feedback
          </Link>

          {/* Sign out -- grouped with the other account-level actions in
              the identity column rather than pinned to the very bottom of
              a much taller grid, now that Notifications/Appearance no
              longer push it far down the page on desktop. */}
          <form action={signout}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-sm border py-2.5 text-sm font-semibold tracking-wide transition-[opacity,transform] duration-150 ease-out hover:opacity-80 active:scale-[0.98]"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
            >
              <SignOutIcon size={15} />
              Sign out
            </button>
          </form>
        </aside>

        {/* ── Recently added ────────────────────────────────────────── */}
        <section>
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h2
                className="font-display text-3xl leading-none tracking-wide sm:text-4xl"
                style={{ color: 'var(--ink)' }}
              >
                RECENTLY ADDED
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-dim)' }}>
                To your watchlist
              </p>
            </div>
            {watchlistCount > 0 && (
              <Link
                href="/watchlist"
                className="shrink-0 text-xs font-semibold tracking-widest uppercase transition-opacity hover:opacity-70"
                style={{ color: 'var(--accent-dim)' }}
              >
                VIEW ALL →
              </Link>
            )}
          </div>

          {recentMovies.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {recentMovies.map((m) => (
                <RecentCard key={m.id} movie={m} />
              ))}
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-sm border py-12 text-center"
              style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
            >
              <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
                Nothing watchlisted yet.
              </p>
              <Link
                href="/browse"
                className="mt-3 text-xs font-semibold tracking-widest uppercase transition-opacity hover:opacity-70"
                style={{ color: 'var(--accent)' }}
              >
                BROWSE MOVIES →
              </Link>
            </div>
          )}
        </section>
      </div>
      </div>
    </main>
  );
}

function RecentCard({
  movie,
}: {
  movie: { id: string; title: string; poster_path: string | null; release_date: string | null; bookable: boolean };
}) {
  const poster = posterUrl(movie.poster_path, 'w342');

  return (
    <Link href={`/movies/${movie.id}`} className="group flex flex-col">
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-sm"
        style={{ background: 'var(--surface)' }}
      >
        {poster ? (
          <Image
            src={poster}
            alt={movie.title}
            fill
            sizes="(max-width: 640px) 50vw, 200px"
            unoptimized
            className="object-cover transition-transform duration-200 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center" style={{ color: 'var(--ink-dim)' }}>
            <FilmIcon size={32} />
          </div>
        )}
      </div>
      <div className="mt-2">
        <p
          className="font-display line-clamp-2 text-base leading-tight"
          style={{ color: 'var(--ink)' }}
        >
          {movie.title}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold tracking-wide uppercase" style={{ color: movie.bookable ? 'var(--accent)' : 'var(--ink-dim)' }}>
          {movie.bookable ? 'Booking' : 'Coming Soon'}
        </p>
      </div>
    </Link>
  );
}

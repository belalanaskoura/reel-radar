import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { NavSearch } from '@/components/NavSearch';
import { RadarLogo } from '@/components/RadarLogo';
import { BookmarkIcon, CinemaIcon, FilmIcon, UserIcon } from '@/components/icons';

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let avatarUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single();
    avatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur-md"
      style={{
        borderColor: 'var(--rule)',
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
      }}
    >
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-4">
        {/* Wordmark */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <RadarLogo size={28} />
          <span
            className="font-display text-xl tracking-wider sm:text-2xl"
            style={{ color: 'var(--ink)' }}
          >
            REELRADAR
          </span>
        </Link>

        {/* Search — only renders on /browse */}
        <Suspense fallback={null}>
          <NavSearch />
        </Suspense>

        {/* Primary nav links — center-ish, pushed right on mobile */}
        <div className="ml-auto flex items-center gap-1 sm:gap-1">
          <NavLink href="/browse" icon={<FilmIcon size={15} />} label="Browse" />
          {user && (
            <NavLink href="/watchlist" icon={<BookmarkIcon size={15} />} label="Watchlist" />
          )}
          <NavLink href="/cinemas" icon={<CinemaIcon size={15} />} label="Cinemas" />
        </div>

        {/* Auth */}
        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/account"
              className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border transition-opacity hover:opacity-70"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              aria-label="Profile"
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
              ) : (
                <UserIcon size={15} />
              )}
            </Link>
          ) : (
            <>
              <Link
                href="/signin"
                className="hidden rounded-sm border px-4 py-1.5 text-xs font-semibold tracking-wide transition-opacity hover:opacity-80 sm:inline-block"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                SIGN IN
              </Link>
              <Link
                href="/signin"
                className="flex h-8 w-8 items-center justify-center rounded-full border sm:hidden"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                aria-label="Sign in"
              >
                <UserIcon size={15} />
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors hover:opacity-70 sm:px-3"
      style={{ color: 'var(--ink-dim)' }}
    >
      <span className="sm:hidden">{icon}</span>
      <span className="hidden text-xs font-medium tracking-wide sm:inline">{label}</span>
    </Link>
  );
}

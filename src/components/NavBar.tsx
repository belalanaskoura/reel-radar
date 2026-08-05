import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { NavSearch } from '@/components/NavSearch';
import { FilmIcon, TicketIcon, UserIcon } from '@/components/icons';

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-20 border-b backdrop-blur" style={{ borderColor: 'var(--rule)', background: 'color-mix(in srgb, var(--bg) 92%, transparent)' }}>
      <div className="h-[3px]" style={{ background: 'var(--accent)' }} />
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-4">
        <Link
          href="/"
          className="font-display text-xl tracking-wide sm:text-2xl"
          style={{ color: 'var(--ink)' }}
        >
          Reel<span style={{ color: 'var(--accent)' }}>Alert</span>
        </Link>

        <Suspense fallback={null}>
          <NavSearch />
        </Suspense>

        <div className="ml-auto flex items-center gap-3 text-sm sm:gap-6">
          <Link
            href="/"
            className="hidden items-center gap-1.5 hover:opacity-70 sm:inline-flex"
            style={{ color: 'var(--ink-dim)' }}
          >
            <FilmIcon size={16} />
            Browse
          </Link>
          {user ? (
            <>
              <Link
                href="/watchlist"
                className="inline-flex items-center gap-1.5 hover:opacity-70"
                style={{ color: 'var(--ink-dim)' }}
              >
                <TicketIcon size={16} />
                <span className="hidden sm:inline">Watchlist</span>
              </Link>
              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 hover:opacity-70"
                style={{ color: 'var(--ink-dim)' }}
              >
                <UserIcon size={16} />
                <span className="hidden sm:inline">Profile</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/signin"
                className="hover:opacity-70"
                style={{ color: 'var(--ink-dim)' }}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-sm px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 sm:px-4"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

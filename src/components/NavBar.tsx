import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b" style={{ borderColor: 'var(--rule)' }}>
      <div className="h-[3px]" style={{ background: 'var(--accent)' }} />
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="font-display text-xl tracking-wide sm:text-2xl"
          style={{ color: 'var(--ink)' }}
        >
          Reel<span style={{ color: 'var(--accent)' }}>Alert</span>
        </Link>
        <div className="flex items-center gap-3 text-sm sm:gap-6">
          <Link
            href="/"
            className="hidden hover:opacity-70 sm:inline"
            style={{ color: 'var(--ink-dim)' }}
          >
            Browse
          </Link>
          {user ? (
            <>
              <Link
                href="/watchlist"
                className="hover:opacity-70"
                style={{ color: 'var(--ink-dim)' }}
              >
                Watchlist
              </Link>
              <Link
                href="/account"
                className="hover:opacity-70"
                style={{ color: 'var(--ink-dim)' }}
              >
                Profile
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

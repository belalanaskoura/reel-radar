import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { NavSearch } from '@/components/NavSearch';
import { RadarLogo } from '@/components/RadarLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BellIcon, CinemaIcon, FilmIcon, UserIcon } from '@/components/icons';

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let avatarUrl: string | null = null;
  let unreadCount = 0;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single();
    avatarUrl = profile?.avatar_url ?? null;

    const { count } = await supabase
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);
    unreadCount = count ?? 0;
  }

  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur-md"
      style={{
        borderColor: 'var(--rule)',
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
      }}
    >
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 sm:flex-nowrap sm:gap-x-6 sm:px-6 sm:py-4">
        {/* Wordmark */}
        <Link href="/" className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <RadarLogo size={24} className="sm:hidden" />
          <RadarLogo size={28} className="hidden sm:block" />
          <span
            className="font-display text-base tracking-wider sm:text-2xl"
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
        <div className="ml-auto flex min-w-0 items-center gap-0 sm:gap-1">
          <NavLink href="/browse" icon={<FilmIcon size={15} />} label="Browse" />
          {user && (
            <NavLink
              href="/notifications-history"
              icon={<BellIcon size={15} />}
              label="Notifications"
              badgeCount={unreadCount}
            />
          )}
          <NavLink href="/cinemas" icon={<CinemaIcon size={15} />} label="Cinemas" />
        </div>

        {/* Theme + Auth */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {user ? (
            <Link
              href="/account"
              className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border transition-opacity hover:opacity-70 sm:h-8 sm:w-8"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              aria-label="Profile"
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
              ) : (
                <UserIcon size={14} />
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
                className="flex h-7 w-7 items-center justify-center rounded-full border sm:hidden"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                aria-label="Sign in"
              >
                <UserIcon size={14} />
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
  badgeCount,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badgeCount?: number;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex flex-col items-center gap-0.5 rounded-sm px-1.5 py-1 text-sm transition-colors hover:opacity-70 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5"
      style={{ color: 'var(--ink-dim)' }}
    >
      <span className="relative">
        {icon}
        {!!badgeCount && <NavBadge />}
      </span>
      <span className="text-[8px] leading-none font-medium tracking-wide whitespace-nowrap sm:text-xs">
        {label}
      </span>
    </Link>
  );
}

function NavBadge() {
  return (
    <span
      className="absolute -top-1 -right-1.5 h-1.5 w-1.5 rounded-full"
      style={{ background: 'var(--accent)' }}
      aria-hidden="true"
    />
  );
}

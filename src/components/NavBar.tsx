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
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 xs:gap-x-3 sm:flex-nowrap sm:gap-x-6 sm:px-6 sm:py-4">
        {/* Wordmark */}
        <Link href="/" className="flex shrink-0 items-center gap-1.5 xs:gap-2 sm:gap-2.5">
          <RadarLogo size={24} className="xs:hidden" />
          <RadarLogo size={27} className="hidden xs:block sm:hidden" />
          <RadarLogo size={28} className="hidden sm:block" />
          <span
            className="font-display text-base tracking-wider xs:text-lg sm:text-2xl"
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
        <div className="ml-auto flex min-w-0 items-center gap-0 xs:gap-0.5 sm:gap-1">
          <NavLink href="/browse" iconSize={15} iconSizeXs={17} label="Browse" icon={FilmIcon} />
          {user && (
            <NavLink
              href="/notifications-history"
              iconSize={15}
              iconSizeXs={17}
              label="Notifications"
              icon={BellIcon}
              badgeCount={unreadCount}
            />
          )}
          <NavLink href="/cinemas" iconSize={15} iconSizeXs={17} label="Cinemas" icon={CinemaIcon} />
        </div>

        {/* Theme + Auth */}
        <div className="flex shrink-0 items-center gap-1.5 xs:gap-2">
          <ThemeToggle />
          {user ? (
            <Link
              href="/account"
              className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border transition-opacity hover:opacity-70 xs:h-8 xs:w-8 sm:h-8 sm:w-8"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              aria-label="Profile"
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
              ) : (
                <UserIcon size={14} className="xs:hidden" />
              )}
              {!avatarUrl && <UserIcon size={16} className="hidden xs:block" />}
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
                className="flex h-7 w-7 items-center justify-center rounded-full border xs:h-8 xs:w-8 sm:hidden"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                aria-label="Sign in"
              >
                <UserIcon size={14} className="xs:hidden" />
                <UserIcon size={16} className="hidden xs:block" />
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
  icon: Icon,
  iconSize,
  iconSizeXs,
  label,
  badgeCount,
}: {
  href: string;
  icon: (props: { size?: number; className?: string; style?: React.CSSProperties }) => React.ReactNode;
  iconSize: number;
  iconSizeXs: number;
  label: string;
  badgeCount?: number;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex flex-col items-center gap-0.5 rounded-sm px-1.5 py-1 text-sm transition-colors hover:opacity-70 xs:px-2 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5"
      style={{ color: 'var(--ink-dim)' }}
    >
      <span className="relative">
        <Icon size={iconSize} className="xs:hidden" />
        <Icon size={iconSizeXs} className="hidden xs:block" />
        {!!badgeCount && <NavBadge />}
      </span>
      <span className="text-[8px] leading-none font-medium tracking-wide whitespace-nowrap xs:text-[10px] sm:text-xs">
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

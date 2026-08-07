import type { User } from '@supabase/supabase-js';
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
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from('profiles').select('avatar_url').eq('id', user.id).single(),
      supabase
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null),
    ]);
    avatarUrl = profile?.avatar_url ?? null;
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
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-1.5 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:gap-x-6 sm:px-6 sm:py-4">
        {/* Wordmark — icon-only until `sm:` (the wordmark text used to
            reappear at the `xs:` (390px) breakpoint, which made the row
            just wide enough to force theme/auth onto its own line at
            exactly that width; staying icon-only all the way through
            `sm:` keeps this a single row at every mobile width). */}
        <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <RadarLogo size={22} className="sm:hidden" />
          <RadarLogo size={28} className="hidden sm:block" />
          <span
            className="font-display hidden text-2xl tracking-wider sm:block"
            style={{ color: 'var(--ink)' }}
          >
            REELRADAR
          </span>
        </Link>

        {/* Primary nav links — everything below `sm:` is deliberately
            compact (tight gaps/padding, one fixed icon size) so this
            stays on the same row as the wordmark and theme/auth instead
            of wrapping to its own line -- a 3rd row here was the
            previous mobile layout, which read as too tall/cluttered. */}
        <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
          <NavLink href="/browse" iconSize={16} label="Browse" icon={FilmIcon} />
          {user && (
            <NavLink
              href="/notifications-history"
              iconSize={16}
              label="Notifications"
              icon={BellIcon}
              badgeCount={unreadCount}
            />
          )}
          <NavLink href="/cinemas" iconSize={16} label="Cinemas" icon={CinemaIcon} />
        </div>

        {/* Theme + Auth */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <AuthSlot user={user} avatarUrl={avatarUrl} />
        </div>

        {/* Search — only renders on /browse, drops to its own full-width
            row (the 2nd row on mobile) rather than fighting the row above
            for space. */}
        <Suspense fallback={null}>
          <NavSearch />
        </Suspense>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  icon: Icon,
  iconSize,
  label,
  badgeCount,
}: {
  href: string;
  icon: (props: { size?: number; className?: string; style?: React.CSSProperties }) => React.ReactNode;
  iconSize: number;
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
        <Icon size={iconSize} className="sm:hidden" />
        <Icon size={17} className="hidden sm:block" />
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

function AuthSlot({ user, avatarUrl }: { user: User | null; avatarUrl: string | null }) {
  if (user) {
    return (
      <Link
        href="/account"
        className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border transition-opacity hover:opacity-70 sm:h-8 sm:w-8"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        aria-label="Profile"
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" fill sizes="32px" className="object-cover" />
        ) : (
          <UserIcon size={14} className="sm:hidden" />
        )}
        {!avatarUrl && <UserIcon size={16} className="hidden sm:block" />}
      </Link>
    );
  }

  return (
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
  );
}

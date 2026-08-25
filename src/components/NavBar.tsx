import type { User } from '@supabase/supabase-js';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { NavSearch } from '@/components/NavSearch';
import { RadarLogo } from '@/components/RadarLogo';
import { BellIcon, CinemaIcon, FilmIcon, RadarIcon, SettingsIcon, UserIcon } from '@/components/icons';
import { isAdminUser } from '@/lib/admin';

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
        {/* Wordmark — always visible now (previously icon-only below
            `sm:`), at a smaller size on mobile so it doesn't crowd out
            the nav links -- everything else in this row was tightened
            to compensate for the extra width this takes up. */}
        <Link href="/" className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <RadarLogo size={22} className="sm:hidden" />
          <RadarLogo size={28} className="hidden sm:block" />
          {/* Bebas Neue's own glyph metrics sit visually high within its
              line box even at leading-none -- a small manual nudge down
              is needed on top of that to actually center against the
              logo mark, not just against the font's own reported line
              height. First attempt (3px/4px) was too much per direct
              user feedback -- this is a smaller correction. */}
          <span
            className="font-display translate-y-[1px] text-lg leading-none tracking-wider sm:translate-y-[2px] sm:text-2xl"
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
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1">
          <NavLink href="/browse" iconSize={21} label="Browse" icon={FilmIcon} />
          {user && (
            <NavLink
              href="/notifications-history"
              iconSize={21}
              label="Notifications"
              icon={BellIcon}
              badgeCount={unreadCount}
            />
          )}
          <NavLink href="/cinemas" iconSize={21} label="Cinemas" icon={CinemaIcon} />
          {isAdminUser(user) && (
            <NavLink href="/admin" iconSize={21} label="Admin" icon={SettingsIcon} />
          )}
        </div>

        {/* Auth -- ThemeToggle removed from here to make room for the
            Watchlist link (still reachable via ThemeSettings on
            /account/edit's Appearance card, just no longer a one-tap
            nav shortcut). Watchlist sits right next to the profile
            avatar, same NavLink treatment as Browse/Cinemas/Notifications
            above, just positioned here instead of in that group. */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {user && (
            <NavLink href="/watchlist" iconSize={22} iconSizeSm={18} label="Watchlist" icon={RadarIcon} />
          )}
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
  iconSizeSm,
  label,
  badgeCount,
}: {
  href: string;
  icon: (props: { size?: number; className?: string; style?: React.CSSProperties }) => React.ReactNode;
  iconSize: number;
  // Defaults to iconSize + 1, matching every existing call site's
  // mobile-to-desktop step (16 -> 17) -- only needs overriding when one
  // icon's shape (e.g. a circular glyph, which reads smaller than a
  // boxy one at the same nominal size) needs a different bump to look
  // consistent with its siblings.
  iconSizeSm?: number;
  label: string;
  badgeCount?: number;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex items-center justify-center rounded-sm p-2 transition-colors hover:opacity-70 sm:gap-1.5 sm:px-3 sm:py-1.5"
      style={{ color: 'var(--ink-dim)' }}
      aria-label={label}
    >
      <span className="relative">
        <Icon size={iconSize} className="sm:hidden" />
        <Icon size={iconSizeSm ?? iconSize + 1} className="hidden sm:block" />
        {!!badgeCount && <NavBadge />}
      </span>
      {/* Label hidden below `sm:` entirely (icon-only, matching the
          wordmark's own breakpoint) rather than the old tiny 8px text
          under each icon -- with the wordmark now always visible and
          Watchlist added as a 5th/6th nav element, keeping every label
          text at every width no longer fits a real narrow phone (a real
          iPhone screenshot showed the row wrapping to 2 lines). */}
      <span className="hidden text-xs leading-none font-medium tracking-wide whitespace-nowrap sm:inline">
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

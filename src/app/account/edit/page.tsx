import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  updateAlertPreferences,
  updateCinemaAlerts,
  updateLineupAlerts,
  updateDisplayName,
  updateEmail,
} from '../actions';
import { AvatarUpload } from '@/components/AvatarUpload';
import { SettingsCard } from '@/components/SettingsCard';
import { CinemaAlertsCard } from '@/components/CinemaAlertsCard';
import { NewReleaseToggle } from '@/components/NewReleaseToggle';
import { LineupAlertsToggle } from '@/components/LineupAlertsToggle';
import { PushSubscribeButton } from '@/components/PushSubscribeButton';
import { ThemeSettings } from '@/components/ThemeSettings';
import { sortBranchesForDisplay } from '@/lib/branches';
import { ArrowLeftIcon, BellIcon, CinemaIcon, SmartphoneIcon, SunIcon, UserIcon } from '@/components/icons';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; email_pending?: string }>;
}) {
  const { error, saved, email_pending } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const [{ data: profile }, { data: branches }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'display_name, avatar_url, notify_new_releases, notify_cinema_showtimes, subscribed_branch_ids, notify_cinema_lineup',
      )
      .eq('id', user.id)
      .single(),
    supabase.from('branches').select('id, name'),
  ]);

  const orderedBranches = sortBranchesForDisplay(branches ?? []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/account"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: 'var(--ink-dim)' }}
      >
        <ArrowLeftIcon size={15} />
        Back to profile
      </Link>

      <h1
        className="font-display mb-8 text-4xl leading-none tracking-wide"
        style={{ color: 'var(--ink)' }}
      >
        SETTINGS
      </h1>

      {(error || saved || email_pending) && (
        <div className="mb-6">
          {error && (
            <p role="alert" className="rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}>
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}>
              Display name saved.
            </p>
          )}
          {email_pending && (
            <p className="rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}>
              Check your inbox to confirm your new email address. Your current email stays active until then.
            </p>
          )}
        </div>
      )}

      {/* One flowing list of collapsible rows instead of separate filled
          cards -- SettingsCard now owns its own top border + expand/
          collapse, so this is just a border-top divider between rows,
          not a stack of boxes each fighting for attention at once.
          Identity opens by default (it's the page's anchor content, and
          the avatar is something worth seeing immediately); everything
          else starts collapsed. */}
      <div className="border-t" style={{ borderColor: 'var(--rule)' }}>
        <SettingsCard title="Identity" icon={<UserIcon size={20} />} defaultOpen>
          {/* A real two-column grid, not flex-wrap: with flex-wrap, once
              the row no longer fit both columns, the shorter Email
              column wrapped above the taller avatar+name column instead
              of stacking cleanly beneath it, leaving empty space
              trailing it. Grid either keeps both named columns side by
              side or collapses to a single column in source order below
              `sm:`, with no orphaned gaps either way. */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[96px_1fr]">
            <div className="flex flex-col gap-3">
              <AvatarUpload userId={user.id} avatarUrl={profile?.avatar_url ?? null} size={96} shape="square" />

              <div>
                <h3 className="mb-1 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
                  Display name
                </h3>
                <form action={updateDisplayName} className="flex flex-col gap-2">
                  <input
                    name="display_name"
                    type="text"
                    maxLength={60}
                    defaultValue={profile?.display_name ?? ''}
                    placeholder="e.g. Belal"
                    className="min-w-0 rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
                    style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
                  />
                  <button
                    type="submit"
                    className="rounded-sm px-4 py-2 text-xs font-semibold tracking-wide transition-opacity hover:opacity-90"
                    style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                  >
                    Save
                  </button>
                </form>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-dim)' }}>
                  Shown on your profile instead of your email.
                </p>
              </div>
            </div>

            {/* Email + Password share this column so the space next to
                the (much taller) avatar/name column isn't left mostly
                empty -- both are "credentials for this account," a
                natural enough pairing rather than an arbitrary fill. */}
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="mb-1 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
                  Email
                </h3>
                <form action={updateEmail} className="flex flex-col gap-2 xs:flex-row">
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={user.email ?? ''}
                    className="min-w-0 flex-1 rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
                    style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-sm px-4 text-xs font-semibold tracking-wide transition-opacity hover:opacity-90"
                    style={{ background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
                  >
                    Update
                  </button>
                </form>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-dim)' }}>
                  Changing this requires confirming a link sent to the new address.
                </p>
              </div>

              <div className="border-t pt-5" style={{ borderColor: 'var(--rule)' }}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
                  Password
                </h3>
                <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                  <Link href="/account/security" className="underline" style={{ color: 'var(--accent-dim)' }}>
                    Change password →
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Push notifications"
          description="Browser delivery for every alert type below"
          icon={<SmartphoneIcon size={20} />}
        >
          <div className="flex flex-col gap-2">
            <PushSubscribeButton />
            <Link
              href="/notifications"
              className="text-xs underline transition-opacity hover:opacity-70"
              style={{ color: 'var(--accent-dim)' }}
            >
              Setup guide →
            </Link>
          </div>
        </SettingsCard>

        <SettingsCard
          title="New releases"
          description="Egypt release date confirmed for watchlisted films"
          icon={<BellIcon size={20} />}
        >
          <NewReleaseToggle
            initialValue={profile?.notify_new_releases ?? true}
            updateAlertPreferences={updateAlertPreferences}
          />
        </SettingsCard>

        <SettingsCard
          title="Cinema alerts"
          description="Local screenings for saved films"
          icon={<CinemaIcon size={20} />}
        >
          <CinemaAlertsCard
            branches={orderedBranches}
            initialEnabled={profile?.notify_cinema_showtimes ?? true}
            initialBranchIds={profile?.subscribed_branch_ids ?? null}
            updateCinemaAlerts={updateCinemaAlerts}
          />
        </SettingsCard>

        <SettingsCard
          title="Cinema lineup alerts"
          description="A movie joins or leaves a cinema you track"
          icon={<CinemaIcon size={20} />}
        >
          <LineupAlertsToggle
            initialValue={profile?.notify_cinema_lineup ?? true}
            updateLineupAlerts={updateLineupAlerts}
          />
        </SettingsCard>

        <SettingsCard title="Appearance" icon={<SunIcon size={20} />}>
          <ThemeSettings />
        </SettingsCard>
      </div>
    </main>
  );
}

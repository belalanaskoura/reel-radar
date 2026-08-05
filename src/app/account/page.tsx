import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signout } from '../signin/actions';
import { updateNtfyTopic, updatePassword } from './actions';
import { BellIcon, KeyIcon, SignOutIcon, UserIcon } from '@/components/icons';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; password_saved?: string }>;
}) {
  const { error, saved, password_saved } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('ntfy_topic')
    .eq('id', user.id)
    .single();

  return (
    <main>
      <div className="relative overflow-hidden border-b" style={{ borderColor: 'var(--rule)' }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-sm px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
            >
              <UserIcon />
            </div>
            <h1 className="font-display text-4xl leading-none" style={{ color: 'var(--ink)' }}>
              Profile
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            {user.email}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-sm px-4 py-8 sm:px-6 sm:py-10">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-sm px-3 py-2 text-sm"
            style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}
          >
            {error}
          </p>
        )}
        {saved && (
          <p
            className="mb-4 rounded-sm px-3 py-2 text-sm"
            style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}
          >
            Notification topic saved.
          </p>
        )}
        {password_saved && (
          <p
            className="mb-4 rounded-sm px-3 py-2 text-sm"
            style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}
          >
            Password updated.
          </p>
        )}

        <section className="mb-8">
          <h2
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--ink-dim)' }}
          >
            <BellIcon size={14} />
            Notifications
          </h2>
          <div className="rounded-sm border p-4" style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}>
            <p className="mb-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
              ntfy.sh topic
            </p>
            <p className="mb-3 text-sm" style={{ color: profile?.ntfy_topic ? 'var(--ink-dim)' : 'var(--error-ink)' }}>
              {profile?.ntfy_topic ?? 'Not set. You will not receive push notifications.'}
            </p>
            <form action={updateNtfyTopic} className="flex flex-col gap-2">
              <input type="hidden" name="return_to" value="/account" />
              <input
                name="ntfy_topic"
                type="text"
                defaultValue={profile?.ntfy_topic ?? ''}
                placeholder="e.g. reelalert-a1b2c3"
                className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
                style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
              />
              <button
                type="submit"
                className="rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Save topic
              </button>
            </form>
            <Link href="/notifications" className="mt-2 inline-block text-xs underline" style={{ color: 'var(--accent)' }}>
              What is ntfy? Full setup guide
            </Link>
          </div>
        </section>

        <section className="mb-8">
          <h2
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--ink-dim)' }}
          >
            <KeyIcon size={14} />
            Password
          </h2>
          <form
            action={updatePassword}
            className="flex flex-col gap-2 rounded-sm border p-4"
            style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
          >
            <label htmlFor="new_password" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              New password
            </label>
            <input
              id="new_password"
              name="new_password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
              style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
            />
            <label htmlFor="confirm_password" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Confirm new password
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
              style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
            />
            <button
              type="submit"
              className="mt-1 rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Update password
            </button>
          </form>
        </section>

        <form action={signout}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-sm transition-opacity hover:opacity-70"
            style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
          >
            <SignOutIcon size={16} />
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { updateNtfyTopic } from '../account/actions';

// Explains ntfy.sh to people who've never heard of it and lets them pick a
// topic in one place. Used both as the post-signup redirect (skippable)
// and as a page anyone signed in can revisit from their profile.
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('ntfy_topic')
    .eq('id', user.id)
    .single();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-10 text-center sm:mb-14">
        <h1 className="font-display mb-3 text-5xl leading-none sm:text-6xl" style={{ color: 'var(--ink)' }}>
          Get notified
        </h1>
        <p className="mx-auto max-w-md text-sm" style={{ color: 'var(--ink-dim)' }}>
          ReelAlert pushes straight to your phone through a free service
          called{' '}
          <a
            href="https://ntfy.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            ntfy.sh
          </a>{' '}
          -- no email, no account linking. Four steps, once, ever.
        </p>
      </div>

      <ol className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Step icon={<DownloadIcon />} number={1} title="Install the ntfy app">
          Free on the{' '}
          <a
            href="https://play.google.com/store/apps/details?id=io.heckel.ntfy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            Play Store
          </a>{' '}
          or{' '}
          <a
            href="https://apps.apple.com/us/app/ntfy/id1625396347"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            App Store
          </a>
          . No account needed -- it just listens for pushes.
        </Step>
        <Step icon={<TagIcon />} number={2} title="Pick a topic below">
          A topic is a private channel name, like a password-free mailbox
          address. Keep it unguessable -- not &quot;movies&quot;.
        </Step>
        <Step icon={<LinkIcon />} number={3} title="Subscribe in the app">
          Open ntfy, tap +, and type the exact same name. That&apos;s the
          whole connection -- no login.
        </Step>
        <Step icon={<BellIcon />} number={4} title="Watchlist and wait">
          The moment a watchlisted movie is bookable at Cairo Festival City
          or District 5, it lands on your phone with a link to book.
        </Step>
      </ol>

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
          Saved. Make sure you&apos;ve subscribed to this exact topic name in the ntfy app.
        </p>
      )}

      <form
        action={updateNtfyTopic}
        className="mx-auto flex max-w-md flex-col gap-2 rounded-sm border p-5"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
      >
        <input type="hidden" name="return_to" value="/notifications" />
        <label htmlFor="ntfy_topic" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Your ntfy topic
        </label>
        <input
          id="ntfy_topic"
          name="ntfy_topic"
          type="text"
          defaultValue={profile?.ntfy_topic ?? ''}
          placeholder="e.g. reelalert-a1b2c3"
          className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
        />
        <button
          type="submit"
          className="mt-2 rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Save topic
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--ink-dim)' }}>
        <Link href="/browse" className="underline" style={{ color: 'var(--accent)' }}>
          Skip for now
        </Link>{' '}
        -- you can always set this up later from your profile.
      </p>
    </main>
  );
}

function Step({
  icon,
  number,
  title,
  children,
}: {
  icon: React.ReactNode;
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className="relative flex gap-4 rounded-sm border p-4"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
    >
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
      >
        {icon}
      </div>
      <div>
        <p
          className="mb-0.5 text-[11px] font-semibold tracking-wide uppercase tabular-nums"
          style={{ color: 'var(--ink-dim)' }}
        >
          Step {number}
        </p>
        <h2 className="mb-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          {children}
        </p>
      </div>
    </li>
  );
}

function iconProps() {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function DownloadIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M20 10l-9.5 9.5a1.5 1.5 0 0 1-2 0L3 14V4h10z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M9 15l6-6" />
      <path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1" />
      <path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

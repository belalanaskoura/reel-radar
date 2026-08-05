import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BellIcon, MapPinIcon, SearchIcon, TicketIcon } from '@/components/icons';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in visitors don't need a pitch; they land straight on what
  // they came for, same as before this page existed.
  if (user) redirect('/browse');

  return (
    <main>
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, var(--ink) 0, var(--ink) 1px, transparent 1px, transparent 64px)',
          }}
        />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
            style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }}
          >
            <MapPinIcon size={14} style={{ color: 'var(--accent)' }} />
            Cairo&apos;s cinemas, all in one place
          </div>

          <h1
            className="font-display mb-4 text-5xl leading-[0.95] sm:text-7xl"
            style={{ color: 'var(--ink)' }}
          >
            Know the second
            <br />
            <span style={{ color: 'var(--accent)' }}>tickets go live.</span>
          </h1>

          <p className="mb-10 max-w-xl text-base sm:text-lg" style={{ color: 'var(--ink-dim)' }}>
            Cinemas don&apos;t tell you when booking opens. ReelAlert watches
            for you, and pushes a notification the moment a movie you care
            about is bookable.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-sm px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Create a free account
            </Link>
            <Link
              href="/browse"
              className="rounded-sm border px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink)', background: 'var(--bg-elevated)' }}
            >
              Browse without an account
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={<SearchIcon />}
            title="See what's coming"
            description="Every movie headed to your cinemas, bookable now or still months out, in one searchable list."
          />
          <FeatureCard
            icon={<TicketIcon />}
            title="Watchlist it"
            description="Add a title before it's even listed. No manually checking back every few days."
          />
          <FeatureCard
            icon={<BellIcon />}
            title="Get pinged"
            description="The instant it's bookable, you get a push notification with a direct booking link."
          />
        </div>
      </div>

      <div className="border-t" style={{ borderColor: 'var(--rule)' }}>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="font-display mb-3 text-3xl leading-tight sm:text-4xl" style={{ color: 'var(--ink)' }}>
            Stop refreshing cinema websites
          </h2>
          <p className="mb-8 text-sm sm:text-base" style={{ color: 'var(--ink-dim)' }}>
            It&apos;s free, takes a minute, and no email confirmation to wait on.
          </p>
          <Link
            href="/signup"
            className="inline-block rounded-sm px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            Create a free account
          </Link>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className="poster-card rounded-sm border p-6"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
    >
      <div
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
      >
        {icon}
      </div>
      <h3 className="mb-1.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
        {description}
      </p>
    </div>
  );
}

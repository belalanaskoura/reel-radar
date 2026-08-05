import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NtfyOnboarding } from '@/components/NtfyOnboarding';

// Interactive, one-step-at-a-time setup for the ntfy push channel, the
// only notification channel this app currently sends (skippable; a
// watchlisted movie is still visible in-app without it). Used both as
// the post-signup redirect and as a page anyone signed in can revisit
// from their profile. The actual step UI lives in NtfyOnboarding
// (client component, owns step/animation state); this page is just the
// auth check and initial data fetch.
export default async function NotificationsPage() {
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
          Set up{' '}
          <a
            href="https://ntfy.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            ntfy.sh
          </a>{' '}
          to get a push notification the instant a watchlisted movie
          becomes bookable.
        </p>
      </div>

      <NtfyOnboarding initialTopic={profile?.ntfy_topic ?? null} />
    </main>
  );
}

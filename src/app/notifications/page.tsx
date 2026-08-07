import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PushOnboarding } from '@/components/PushOnboarding';

// Setup for the browser push channel, the only notification channel this
// app currently sends (skippable when landing here fresh post-signup; a
// watchlisted movie is still visible in-app without it). Used both as
// the post-signup redirect and as a page anyone signed in can revisit
// from their profile -- the two contexts are distinguished by `from`,
// since "skip for now" only makes sense on the way through signup, not
// when a user has deliberately navigated here to manage settings.
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-14">
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="font-display mb-2 text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
          Get notified
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
          One tap, no account setup, notified the second tickets go live.
        </p>
      </div>

      <PushOnboarding showSkip={from === 'signup'} />
    </main>
  );
}

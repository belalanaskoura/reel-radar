import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signout } from '../signin/actions';
import { updateNtfyTopic } from './actions';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
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
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="font-display mb-1 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
        Account
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--ink-dim)' }}>
        Signed in as {user.email}
      </p>

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
          Saved.
        </p>
      )}

      <form action={updateNtfyTopic} className="flex flex-col gap-2">
        <label htmlFor="ntfy_topic" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          ntfy.sh topic
        </label>
        <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
          Pick a private, hard-to-guess topic name and subscribe to it in the
          ntfy app -- anyone who knows this name can read your notifications.
        </p>
        <input
          id="ntfy_topic"
          name="ntfy_topic"
          type="text"
          defaultValue={profile?.ntfy_topic ?? ''}
          placeholder="e.g. reelalert-a1b2c3"
          className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
        />
        <button
          type="submit"
          className="mt-1 rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Save
        </button>
      </form>

      <form action={signout} className="mt-6">
        <button
          type="submit"
          className="rounded-sm border px-3 py-2 text-sm transition-opacity hover:opacity-70"
          style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}

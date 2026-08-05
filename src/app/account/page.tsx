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
    <main>
      <h1>Account</h1>
      <p>Signed in as {user.email}</p>

      {error && <p role="alert">{error}</p>}
      {saved && <p>Saved.</p>}

      <form action={updateNtfyTopic}>
        <label htmlFor="ntfy_topic">
          ntfy.sh topic
          <div>
            Pick a private, hard-to-guess topic name and subscribe to it in
            the ntfy app -- anyone who knows this name can read your
            notifications.
          </div>
        </label>
        <input
          id="ntfy_topic"
          name="ntfy_topic"
          type="text"
          defaultValue={profile?.ntfy_topic ?? ''}
          placeholder="e.g. reel-alert-a1b2c3"
        />
        <button type="submit">Save</button>
      </form>

      <form action={signout}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}

import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main>
      <h1>reel-alert</h1>
      <p>
        Watchlist upcoming movies at Scene Cinemas and get notified the
        moment tickets go live.
      </p>
      {user ? (
        <p>
          Signed in as {user.email}. <a href="/account">Account settings</a>
        </p>
      ) : (
        <p>
          <a href="/signin">Sign in</a> or <a href="/signup">sign up</a> to
          get started.
        </p>
      )}
    </main>
  );
}

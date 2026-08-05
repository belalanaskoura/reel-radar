import { signin } from './actions';

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Sign in</h1>
      {error && <p role="alert">{error}</p>}
      <form action={signin}>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit">Sign in</button>
      </form>
      <p>
        Don&apos;t have an account? <a href="/signup">Sign up</a>
      </p>
    </main>
  );
}

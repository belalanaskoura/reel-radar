import { signup } from './actions';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Sign up</h1>
      {error && <p role="alert">{error}</p>}
      <form action={signup}>
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
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <button type="submit">Sign up</button>
      </form>
      <p>
        Already have an account? <a href="/signin">Sign in</a>
      </p>
    </main>
  );
}

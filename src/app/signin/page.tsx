import Link from 'next/link';
import { signin } from './actions';

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="font-display mb-8 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
        Sign in
      </h1>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-sm px-3 py-2 text-sm"
          style={{ background: '#3a1810', color: '#f3a58a' }}
        >
          {error}
        </p>
      )}
      <form action={signin} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
            style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
            style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
          />
        </div>
        <button
          type="submit"
          className="rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          Sign in
        </button>
      </form>
      <p className="mt-4 text-sm" style={{ color: 'var(--ink-dim)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="underline" style={{ color: 'var(--accent)' }}>
          Sign up
        </Link>
      </p>
    </main>
  );
}

import Link from 'next/link';
import { signup } from './actions';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { authErrorMessage, MIN_PASSWORD_LENGTH } from '@/lib/auth-error-codes';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; check_email?: string }>;
}) {
  const { error: errorCode, check_email } = await searchParams;
  const error = authErrorMessage(errorCode);

  return (
    <main className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
        }}
      />
      <div className="relative mx-auto max-w-sm px-6 py-16">
        <h1 className="font-display mb-8 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
          Sign up
        </h1>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-sm px-3 py-2 text-sm"
            style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}
          >
            {error}
          </p>
        )}
        {check_email && (
          <p
            className="mb-4 rounded-sm px-3 py-2 text-sm"
            style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}
          >
            Check your email to confirm your address, then sign in.
          </p>
        )}
        <form action={signup} className="flex flex-col gap-4">
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
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
              style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
            />
          </div>
          <button
            type="submit"
            className="rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            Sign up
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: 'var(--rule)' }} />
          <span className="text-xs" style={{ color: 'var(--ink-dim)' }}>
            or
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--rule)' }} />
        </div>

        <GoogleSignInButton />

        <p className="mt-4 text-sm" style={{ color: 'var(--ink-dim)' }}>
          Already have an account?{' '}
          <Link href="/signin" className="underline" style={{ color: 'var(--accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

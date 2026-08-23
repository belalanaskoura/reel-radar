import Link from 'next/link';
import { requestPasswordReset } from './actions';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

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
        <h1 className="font-display mb-2 text-4xl leading-none" style={{ color: 'var(--ink)' }}>
          Forgot password
        </h1>
        <p className="mb-8 text-sm" style={{ color: 'var(--ink-dim)' }}>
          Enter your email and we&apos;ll send you a link to reset it.
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

        {sent ? (
          <p className="rounded-sm px-4 py-3 text-sm" style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}>
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form action={requestPasswordReset} className="flex flex-col gap-4">
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
            <button
              type="submit"
              className="rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Send reset link
            </button>
          </form>
        )}

        <p className="mt-4 text-sm" style={{ color: 'var(--ink-dim)' }}>
          <Link href="/signin" className="underline" style={{ color: 'var(--accent)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

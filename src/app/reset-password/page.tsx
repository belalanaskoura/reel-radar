import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './ResetPasswordForm';
import { resetPassword } from './actions';
import { authErrorMessage } from '@/lib/auth-error-codes';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  const error = authErrorMessage(errorCode);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session at all means this page was opened directly, not via a
  // real recovery link -- send them to request one instead of showing a
  // form that can never succeed.
  if (!user) redirect('/forgot-password');

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
          Set a new password
        </h1>
        <p className="mb-8 text-sm" style={{ color: 'var(--ink-dim)' }}>
          Choose a new password for your account.
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

        <ResetPasswordForm resetPassword={resetPassword} />
      </div>
    </main>
  );
}

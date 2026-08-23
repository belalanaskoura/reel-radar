import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SecurityPanel } from '@/components/SecurityPanel';
import { updatePassword } from '../actions';
import { ArrowLeftIcon } from '@/components/icons';

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; password_saved?: string }>;
}) {
  const { error, password_saved } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  return (
    <main className="mx-auto max-w-sm px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/account/edit"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: 'var(--ink-dim)' }}
      >
        <ArrowLeftIcon size={15} />
        Back to settings
      </Link>

      <h1 className="font-display mb-8 text-4xl leading-none tracking-wide" style={{ color: 'var(--ink)' }}>
        PASSWORD
      </h1>

      {error && (
        <p role="alert" className="mb-6 rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
      {password_saved && (
        <p className="mb-6 rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}>
          Password updated.
        </p>
      )}

      <SecurityPanel updatePassword={updatePassword} />
    </main>
  );
}

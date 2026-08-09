import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FeedbackForm } from '@/components/FeedbackForm';
import { ArrowLeftIcon } from '@/components/icons';

export default async function FeedbackPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/account"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: 'var(--ink-dim)' }}
      >
        <ArrowLeftIcon size={15} />
        Back to profile
      </Link>

      <h1
        className="font-display mb-2 text-4xl leading-none tracking-wide"
        style={{ color: 'var(--ink)' }}
      >
        SEND FEEDBACK
      </h1>
      <p className="mb-8 max-w-[90%] text-sm" style={{ color: 'var(--ink-dim)' }}>
        Bug reports, movie requests, or just saying hi — your feedback goes directly to me.
      </p>

      <FeedbackForm email={user.email ?? ''} />
    </main>
  );
}

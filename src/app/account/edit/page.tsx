import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { updateDisplayName, updateEmail, updatePassword } from '../actions';
import { AvatarUpload } from '@/components/AvatarUpload';
import { SecurityPanel } from '@/components/SecurityPanel';
import { ArrowLeftIcon } from '@/components/icons';

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; email_pending?: string }>;
}) {
  const { error, saved, email_pending } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single();

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/account"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: 'var(--ink-dim)' }}
      >
        <ArrowLeftIcon size={15} />
        Back to profile
      </Link>

      <h1
        className="font-display mb-8 text-4xl leading-none tracking-wide"
        style={{ color: 'var(--ink)' }}
      >
        EDIT PROFILE
      </h1>

      {(error || saved || email_pending) && (
        <div className="mb-6">
          {error && (
            <p role="alert" className="rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}>
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}>
              Display name saved.
            </p>
          )}
          {email_pending && (
            <p className="rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}>
              Check your inbox to confirm your new email address. Your current email stays active until then.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-8">
        {/* Avatar */}
        <section>
          <h2
            className="font-display mb-3 text-xl leading-none tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            PHOTO
          </h2>
          <AvatarUpload userId={user.id} avatarUrl={profile?.avatar_url ?? null} size={96} shape="square" />
        </section>

        {/* Display name */}
        <section
          className="rounded-sm border p-5"
          style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
        >
          <h2
            className="font-display mb-1 text-xl leading-none tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            DISPLAY NAME
          </h2>
          <p className="mb-4 text-xs" style={{ color: 'var(--ink-dim)' }}>
            Shown on your profile instead of your email.
          </p>
          <form action={updateDisplayName} className="flex flex-col gap-2 sm:max-w-sm">
            <input
              name="display_name"
              type="text"
              maxLength={60}
              defaultValue={profile?.display_name ?? ''}
              placeholder="e.g. Belal"
              className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
              style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
            />
            <button
              type="submit"
              className="rounded-sm py-2 text-xs font-semibold tracking-wide transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              SAVE
            </button>
          </form>
        </section>

        {/* Email */}
        <section
          className="rounded-sm border p-5"
          style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
        >
          <h2
            className="font-display mb-1 text-xl leading-none tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            EMAIL
          </h2>
          <p className="mb-4 text-xs" style={{ color: 'var(--ink-dim)' }}>
            Changing this requires confirming a link sent to the new address.
          </p>
          <form action={updateEmail} className="flex flex-col gap-2 sm:max-w-sm">
            <input
              name="email"
              type="email"
              required
              defaultValue={user.email ?? ''}
              className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
              style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
            />
            <button
              type="submit"
              className="rounded-sm py-2 text-xs font-semibold tracking-wide transition-opacity hover:opacity-90"
              style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
            >
              UPDATE EMAIL
            </button>
          </form>
        </section>

        {/* Password */}
        <section>
          <SecurityPanel updatePassword={updatePassword} defaultOpen />
        </section>
      </div>
    </main>
  );
}

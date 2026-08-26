'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-error-codes';

// Separate from src/app/account/actions.ts's updatePassword despite
// doing the same auth.updateUser({ password }) call -- that action
// redirects to /account on both success and failure, which makes no
// sense for someone who just clicked a recovery email link and isn't
// meaningfully "in their account" yet. This one redirects back to
// /reset-password on failure (so they can retry without re-clicking the
// email link) and to /signin on success.
export async function resetPassword(formData: FormData) {
  const newPassword = formData.get('new_password') as string;

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    redirect('/reset-password?error=weak_password');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session means the recovery link was never followed (or already
  // used/expired) -- nothing to update against.
  if (!user) {
    redirect('/forgot-password?error=link_expired');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect('/reset-password?error=update_failed');
  }

  redirect('/signin?saved=1');
}

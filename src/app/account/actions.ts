'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function updateAlertPreferences(values: {
  notify_new_releases: boolean;
  notify_cinema_showtimes: boolean;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  const { error } = await supabase
    .from('profiles')
    .update(values)
    .eq('id', user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/account');
  return { error: null };
}

export async function updateDisplayName(formData: FormData) {
  const displayName = (formData.get('display_name') as string).trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName || null })
    .eq('id', user.id);

  if (error) {
    redirect(`/account/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/account');
  revalidatePath('/account/edit');
  redirect('/account/edit?saved=1');
}

// Supabase requires a confirmation click before an email change actually
// takes effect (sent to the new address, and to the old one too if
// "Secure email change" is on) -- updateUser() here only *starts* that
// flow, it doesn't change auth.users.email immediately. profiles.email
// gets kept in sync separately, by a trigger on auth.users that fires
// once the change is actually confirmed (see the on_auth_user_email_updated
// trigger), not by this action.
export async function updateEmail(formData: FormData) {
  const newEmail = (formData.get('email') as string).trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  if (!newEmail || newEmail === user.email) {
    redirect('/account/edit');
  }

  const { error } = await supabase.auth.updateUser({ email: newEmail });

  if (error) {
    redirect(`/account/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/account/edit?email_pending=1');
}

export async function updatePassword(formData: FormData) {
  const newPassword = formData.get('new_password') as string;

  if (newPassword.length < 6) {
    redirect(`/account?error=${encodeURIComponent('Password must be at least 6 characters.')}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect(`/account?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/account?password_saved=1');
}

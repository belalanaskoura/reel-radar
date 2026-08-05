'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function updateNtfyTopic(formData: FormData) {
  const ntfyTopic = (formData.get('ntfy_topic') as string).trim();
  const returnTo = (formData.get('return_to') as string) || '/account';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ ntfy_topic: ntfyTopic || null })
    .eq('id', user.id);

  if (error) {
    const message =
      error.code === '23505'
        ? 'That ntfy topic is already taken by another account, pick a different one.'
        : error.message;
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/account');
  revalidatePath('/notifications');
  redirect(`${returnTo}?saved=1`);
}

// Same write as updateNtfyTopic but returns a result instead of
// redirecting, for the client-driven /notifications stepper (NtfyOnboarding)
// which needs to advance to the next step in place rather than reload.
export async function saveNtfyTopic(topic: string): Promise<{ error: string | null }> {
  const ntfyTopic = topic.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ ntfy_topic: ntfyTopic || null })
    .eq('id', user.id);

  if (error) {
    const message =
      error.code === '23505'
        ? 'That ntfy topic is already taken by another account, pick a different one.'
        : error.message;
    return { error: message };
  }

  revalidatePath('/account');
  revalidatePath('/notifications');
  return { error: null };
}

export async function updatePassword(formData: FormData) {
  const newPassword = formData.get('new_password') as string;
  const confirmPassword = formData.get('confirm_password') as string;

  if (newPassword !== confirmPassword) {
    redirect(`/account?error=${encodeURIComponent('Passwords do not match.')}`);
  }
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

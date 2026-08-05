'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function updateNtfyTopic(formData: FormData) {
  const ntfyTopic = (formData.get('ntfy_topic') as string).trim();

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
        ? 'That ntfy topic is already taken by another account -- pick a different one.'
        : error.message;
    redirect(`/account?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/account');
  redirect('/account?saved=1');
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/analytics';

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');
  return { supabase, userId: user.id };
}

export async function followCinema(branchId: string) {
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase.from('cinema_follows').insert({ user_id: userId, branch_id: branchId });
  if (error && error.code !== '23505') {
    // 23505 = already following, not a real error for this action.
    throw new Error(error.message);
  }
  if (!error) {
    logEvent({ type: 'cinema_follow_add', payload: { user_id: userId, branch_id: branchId } });
  }
  revalidatePath('/cinemas');
  revalidatePath(`/cinemas/${branchId}`);
  revalidatePath('/watchlist');
}

export async function unfollowCinema(branchId: string) {
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase
    .from('cinema_follows')
    .delete()
    .eq('user_id', userId)
    .eq('branch_id', branchId);
  if (error) throw new Error(error.message);
  revalidatePath('/cinemas');
  revalidatePath(`/cinemas/${branchId}`);
  revalidatePath('/watchlist');
}

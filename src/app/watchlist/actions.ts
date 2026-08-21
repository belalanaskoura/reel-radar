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

export async function addToWatchlist(movieId: string) {
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase.from('watchlist').insert({ user_id: userId, movie_id: movieId });
  if (error && error.code !== '23505') {
    // 23505 = already on the watchlist, not a real error for this action.
    throw new Error(error.message);
  }
  if (!error) {
    logEvent({ type: 'watchlist_add', payload: { user_id: userId, movie_id: movieId } });
  }
  revalidatePath('/watchlist');
  revalidatePath(`/movies/${movieId}`);
}

export async function removeFromWatchlist(movieId: string) {
  const { supabase, userId } = await requireUserId();
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('movie_id', movieId);
  if (error) throw new Error(error.message);
  revalidatePath('/watchlist');
  revalidatePath(`/movies/${movieId}`);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function updateAlertPreferences(values: {
  notify_new_releases: boolean;
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

// Cinema showtime alerts and which branches they apply to are saved
// together (CinemaAlertsCard treats them as one card, one save), rather
// than as two separate actions the way they were split before -- a
// branch list edit right after flipping the master switch off shouldn't
// be able to land as two independent writes that could race or partially
// fail against each other.
//
// null for subscribedBranchIds means "every branch" (this project's
// default -- see /api/poll's notifyWatchers), so selecting every branch
// in the UI is stored back as null rather than an explicit array listing
// all of them: a branch added later should be included automatically,
// not silently excluded because it wasn't on the list at save time.
export async function updateLineupAlerts(values: {
  notify_cinema_lineup: boolean;
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

export async function updateCinemaAlerts(values: {
  notify_cinema_showtimes: boolean;
  subscribed_branch_ids: string[] | null;
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
  revalidatePath('/notifications');
  return { error: null };
}

// PushOnboarding's branch picker only ever collects a branch list (no
// separate master switch there -- picking branches during first-run
// setup already implies alerts are being turned on), so this adapts that
// narrower shape onto updateCinemaAlerts. A plain arrow function closing
// over updateCinemaAlerts would NOT work here despite looking
// equivalent: only a real 'use server' function (or one bound via
// .bind(), the pattern used elsewhere in this codebase -- see
// MovieCard's watchlist actions) can cross the server-to-client
// component boundary as a passable action reference.
export async function updateCinemaAlertsFromOnboarding(
  branchIds: string[] | null,
): Promise<{ error: string | null }> {
  return updateCinemaAlerts({ notify_cinema_showtimes: true, subscribed_branch_ids: branchIds });
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

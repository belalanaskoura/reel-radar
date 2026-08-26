'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-error-codes';

// Verifies the caller actually knows the current password before a
// credential change, rather than trusting that holding a session is
// proof of identity.
//
// Without this, any temporary session compromise -- a borrowed unlocked
// laptop, a stolen cookie, a shared device -- converts into permanent
// account takeover in two form fields, and the real owner cannot recover
// because the attacker changes the email first.
//
// signInWithPassword against the session user's own address is the check;
// it does not disturb the existing session on success. Rate limited so
// this doesn't become an oracle for brute-forcing the current password
// from an already-hijacked session.
async function verifyCurrentPassword(
  email: string,
  currentPassword: string,
  userId: string,
): Promise<boolean> {
  if (!currentPassword) return false;
  if (!(await checkRateLimit(`reauth:user:${userId}`, 5, 900))) return false;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  return !error;
}

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

// Remembers the user's answer to WatchlistGrid's "Remove from
// watchlist?" confirm dialog (shown when clicking View Showtimes on a
// tracked movie) so it stops asking once they've told it what they
// want -- 'ask' (default, keep asking every time), 'always_remove'
// (auto-remove with no dialog), or 'always_keep' (never remove, no
// dialog). Changing your mind later means editing this setting
// directly on /account/edit, not re-triggering the dialog somehow.
export async function updateWatchlistConfirmPreference(
  value: 'ask' | 'always_remove' | 'always_keep',
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ watchlist_booking_click_action: value })
    .eq('id', user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/account');
  revalidatePath('/account/edit');
  revalidatePath('/watchlist');
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
    redirect('/account/edit?error=update_failed');
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
  const currentPassword = (formData.get('current_password') as string) ?? '';

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

  if (!user.email || !(await verifyCurrentPassword(user.email, currentPassword, user.id))) {
    redirect('/account/edit?error=wrong_password');
  }

  const { error } = await supabase.auth.updateUser({ email: newEmail });

  if (error) {
    redirect('/account/edit?error=update_failed');
  }

  redirect('/account/edit?email_pending=1');
}

export async function updatePassword(formData: FormData) {
  const newPassword = formData.get('new_password') as string;
  const currentPassword = (formData.get('current_password') as string) ?? '';

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    redirect('/account/security?error=weak_password');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin');
  }

  if (!user.email || !(await verifyCurrentPassword(user.email, currentPassword, user.id))) {
    redirect('/account/security?error=wrong_password');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect('/account/security?error=update_failed');
  }

  redirect('/account/security?password_saved=1');
}

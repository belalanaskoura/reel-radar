'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { notifyFeedbackByEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';

const MAX_MESSAGE_LENGTH = 4000;

export async function submitFeedback(message: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  // Every call writes a row and sends a real email, so this is keyed per
  // account rather than per IP -- the account is the thing that has to be
  // spent to abuse it.
  if (!(await checkRateLimit(`feedback:user:${user.id}`, 5, 3600))) {
    return { error: 'You’ve sent a lot of feedback just now. Try again in an hour.' };
  }

  const trimmed = message.trim();
  if (!trimmed) {
    return { error: 'Feedback can’t be empty.' };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { error: 'Feedback is too long.' };
  }

  const fromEmail = user.email ?? 'unknown';

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    email: fromEmail,
    message: trimmed,
  });
  if (error) {
    return { error: error.message };
  }

  // Best-effort, matching the /api/poll notification pattern -- a failed
  // send here shouldn't lose the feedback, it's already saved above.
  try {
    await notifyFeedbackByEmail({ fromEmail, message: trimmed });
  } catch {
    // swallow, the row in `feedback` is the source of truth
  }

  return { error: null };
}

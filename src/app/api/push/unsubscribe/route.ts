import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Removes one browser's push subscription. RLS scopes deletes to the
// caller's own rows (see push_subscriptions policy), so this can't be
// used to remove someone else's subscription even with a forged endpoint.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint } = body as { endpoint?: string };

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

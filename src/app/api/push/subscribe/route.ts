import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedPushEndpoint, MAX_SUBSCRIPTIONS_PER_USER } from '@/lib/push-endpoint';

// Stores a browser's push subscription against the signed-in user. Called
// by PushSubscribeButton right after the browser grants permission and
// registers with the push service. Upserts on (user_id, endpoint) so
// re-subscribing the same browser (e.g. after clearing the old
// subscription) never creates a duplicate row.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint, keys } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: 'Unrecognized push endpoint' }, { status: 400 });
  }

  // Counted before the upsert, and only blocking when this endpoint is a
  // new one -- re-subscribing an already-stored browser must keep working
  // even at the cap, or a user at the limit could never refresh a device
  // they already have.
  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id);

  const alreadyStored = (existing ?? []).some((row) => row.endpoint === endpoint);
  if (!alreadyStored && (existing?.length ?? 0) >= MAX_SUBSCRIPTIONS_PER_USER) {
    return NextResponse.json(
      { error: 'Too many registered devices. Remove one first.' },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: 'user_id,endpoint' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

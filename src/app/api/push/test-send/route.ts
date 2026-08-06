import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// TEMPORARY, diagnostic version -- calls webpush.sendNotification directly
// per subscription and reports the real per-subscription result (endpoint
// host, status code or thrown error) instead of just a count, since a
// bare "sent: N" from notifyBookablePush was hiding what's actually
// happening on the push-service side. Remove after verification.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  webpush.setVapidDetails(
    'mailto:belalhamada489@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const supabase = createServiceRoleClient();
  const { data: subs, error: fetchError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, created_at')
    .eq('user_id', userId);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results = await Promise.all(
    (subs ?? []).map(async (sub) => {
      const endpointHost = new URL(sub.endpoint).host;
      try {
        const res = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: 'Iron Maiden: Burning Ambition tickets available!',
            body: 'Bookable at Cairo Festival City now.',
            url: 'https://cfc.scenecinemas.com/',
          }),
        );
        return {
          id: sub.id,
          created_at: sub.created_at,
          endpointHost,
          ok: true,
          statusCode: res.statusCode,
        };
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        return {
          id: sub.id,
          created_at: sub.created_at,
          endpointHost,
          ok: false,
          statusCode: e.statusCode ?? null,
          body: e.body ?? null,
          message: e.message ?? String(err),
        };
      }
    }),
  );

  return NextResponse.json({ count: subs?.length ?? 0, results });
}

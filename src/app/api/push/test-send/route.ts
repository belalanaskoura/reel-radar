import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { notifyBookablePush } from '@/lib/push';

// TEMPORARY, for verifying real push delivery end-to-end without going
// through /api/poll's live Scene scrape. Sends a real push straight to
// every subscription belonging to the given user_id. Remove after
// verification -- not part of the app's real notification pipeline.
export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const sent = await notifyBookablePush(supabase, userId, {
    movieTitle: 'Iron Maiden: Burning Ambition',
    branchName: 'Cairo Festival City',
    bookingUrl: 'https://cfc.scenecinemas.com/',
  });

  return NextResponse.json({ sent });
}

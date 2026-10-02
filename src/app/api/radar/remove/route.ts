import { NextResponse } from 'next/server';
import { removeFromRadarWithToken } from '@/lib/radar-remove';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

// Called by public/sw.js when someone taps "Remove from radar" on a push
// notification. POST only: a GET here would let anything that fetches
// URLs (link previewers, scanners) remove items. The signed token in the
// body is the only authorization, so no cookie is read and a cross-site
// request without the token can't do anything.
export async function POST(request: Request) {
  if (!(await checkRateLimit(`radar-remove:ip:${clientIp(request.headers)}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await removeFromRadarWithToken(token);
    if (result.status === 'invalid') {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 400 });
    }
    return NextResponse.json({ status: result.status });
  } catch (err) {
    logError('radar-remove', err, { via: 'push' });
    return NextResponse.json({ error: 'Could not remove' }, { status: 500 });
  }
}

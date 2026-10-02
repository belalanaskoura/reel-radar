'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { removeFromRadarWithToken } from '@/lib/radar-remove';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

// The only place an email's "Remove from radar" link actually removes
// anything. The link itself opens a confirm page (a GET that changes
// nothing, so mail scanners prefetching it are harmless); this runs only
// when the person submits that page's form. Server actions also reject
// cross-origin posts by checking the Origin header.
export async function confirmRemoveFromRadar(formData: FormData) {
  const raw = formData.get('token');
  // Real tokens are well under 256 characters; anything longer is junk
  // and shouldn't be echoed into the redirect's Location header.
  const token = typeof raw === 'string' && raw.length <= 256 ? raw : null;
  const tokenParam = token ? encodeURIComponent(token) : '';

  if (!(await checkRateLimit(`radar-remove:ip:${clientIp(await headers())}`, 30, 3600))) {
    redirect(`/radar/remove?t=${tokenParam}&error=rate_limited`);
  }

  let removed = false;
  try {
    const result = await removeFromRadarWithToken(token);
    removed = result.status !== 'invalid';
  } catch (err) {
    logError('radar-remove', err, { via: 'email' });
    redirect(`/radar/remove?t=${tokenParam}&error=failed`);
  }

  redirect(`/radar/remove?t=${tokenParam}${removed ? '&done=1' : ''}`);
}

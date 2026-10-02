import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyRadarToken, type RadarLinkClaims } from '@/lib/radar-link';

// Latest watchlist.created_at a token may act on. One second of slack
// because issuedAt is rounded down to the second.
export function radarLinkRowCutoff(claims: RadarLinkClaims): string {
  return new Date((claims.issuedAt + 1) * 1000).toISOString();
}

export type RadarRemoveResult =
  | { status: 'invalid' }
  | { status: 'removed' | 'not_on_radar'; claims: RadarLinkClaims };

// Server-only. Deletes exactly the (user, movie) watchlist row a verified
// token names, using the service-role client since the caller may have no
// session. Shared by the confirm page's server action and the service
// worker's POST endpoint so both paths check the token the same way.
export async function removeFromRadarWithToken(token: string | null | undefined): Promise<RadarRemoveResult> {
  const claims = verifyRadarToken(token, process.env.RADAR_LINK_SECRET);
  if (!claims) return { status: 'invalid' };

  const supabase = createServiceRoleClient();
  // Only a row that existed when the link was minted. If the movie was
  // removed and added back since, an old email (or one forwarded to
  // someone else) can't remove it again.
  const { data, error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', claims.userId)
    .eq('movie_id', claims.movieId)
    .lte('created_at', radarLinkRowCutoff(claims))
    .select('movie_id');
  if (error) throw new Error(error.message);

  revalidatePath('/watchlist');
  revalidatePath(`/movies/${claims.movieId}`);

  return { status: data && data.length > 0 ? 'removed' : 'not_on_radar', claims };
}

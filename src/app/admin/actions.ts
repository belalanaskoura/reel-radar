'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isAdminUser } from '@/lib/admin';
import { normalizeTitle } from '@/lib/matching/normalize';
import { searchMovies, getMovieById, findByImdbId, type TmdbMovie } from '@/lib/tmdb';
import { applyTmdbMatch } from '@/lib/matching/match-to-tmdb';

// The job routes this calls are already protected by SYNC_SECRET (the
// same header the external scheduler sends) -- this action does a
// server-to-server fetch with that secret rather than duplicating any
// job logic, so the routes themselves are untouched.
const JOB_ROUTES = {
  'scrape-scene': '/api/scrape-scene',
  'scrape-scene-delist': '/api/scrape-scene-delist',
  'scrape-vox': '/api/scrape-vox',
  poll: '/api/poll',
  'match-movies': '/api/match-movies',
  'admin-digest': '/api/admin-digest',
} as const;

type JobName = keyof typeof JOB_ROUTES;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminUser(user)) {
    throw new Error('Not authorized');
  }
}

export async function triggerJob(
  job: JobName,
  params?: { branch?: string },
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.SYNC_SECRET;
  if (!siteUrl || !secret) {
    return { ok: false, message: 'Missing NEXT_PUBLIC_SITE_URL or SYNC_SECRET configuration' };
  }

  const url = new URL(JOB_ROUTES[job], siteUrl);
  if (params?.branch) url.searchParams.set('branch', params.branch);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-sync-secret': secret },
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      return { ok: false, message: (body?.error as string) ?? `Request failed (${res.status})` };
    }

    revalidatePath('/admin');
    revalidatePath('/admin/scrapers');
    revalidatePath('/admin/matching');
    revalidatePath('/admin/notifications');

    return { ok: true, message: summarize(job, body) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Request failed' };
  }
}

// Fetches live TMDB candidates for one backlog movie, on demand (not for
// every row on page load -- the backlog can grow and each candidate list
// is a real TMDB search, see the admin/matching page for how this is
// wired to a per-row "Resolve" click). Same English-then-Arabic fallback
// findTmdbMatch uses, so the candidate list an admin sees here always
// matches what the automated pipeline itself would have seen.
export async function fetchCandidatesForMovie(
  movieId: string,
): Promise<{ ok: boolean; message?: string; title?: string; candidates?: TmdbMovie[] }> {
  await requireAdmin();

  const supabase = createServiceRoleClient();
  const { data: movie, error } = await supabase
    .from('movies')
    .select('title')
    .eq('id', movieId)
    .maybeSingle();

  if (error || !movie) {
    return { ok: false, message: 'Movie not found' };
  }

  const query = normalizeTitle(movie.title);
  let candidates = await searchMovies(query, 'en-US');
  if (candidates.length === 0) {
    candidates = await searchMovies(query, 'ar');
  }

  return { ok: true, title: movie.title, candidates };
}

// Applies an admin-chosen TMDB id to a backlog movie -- reuses
// applyTmdbMatch, the exact same adopt-or-merge logic the automated
// matchScenesToTmdb pipeline uses, so a manual resolve behaves
// identically to an automatic one (same slug/cache-merge handling if the
// chosen tmdb_id already has a row, same field backfill otherwise).
export async function resolveMovieMatch(
  movieId: string,
  tmdbId: number,
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const tmdbMovie = await getMovieById(tmdbId);
  if (!tmdbMovie) {
    return { ok: false, message: `TMDB has no movie with id ${tmdbId}` };
  }
  return applyAndRespond(movieId, tmdbMovie);
}

// Same as resolveMovieMatch, but resolves via an IMDb id instead of a
// TMDB one -- reuses findByImdbId (already built for the elCinema/IMDb
// automated fallback, see match-to-tmdb.ts) so a manual admin lookup and
// the automated pipeline's own fallback share one TMDB-side lookup
// implementation. Useful when an admin has an IMDb link (imdb.com/title/
// tt...) but not a TMDB id offhand -- Egyptian films are more reliably
// on IMDb than in TMDB's own search results, per the reason this
// fallback was added to the pipeline in the first place.
export async function resolveMovieMatchByImdbId(
  movieId: string,
  imdbId: string,
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const normalized = normalizeImdbId(imdbId);
  if (!normalized) {
    return { ok: false, message: 'IMDb id must look like "tt1234567" (a bare id, a number, or an imdb.com/title/ link)' };
  }

  const tmdbMovie = await findByImdbId(normalized);
  if (!tmdbMovie) {
    return { ok: false, message: `TMDB has no movie linked to IMDb id ${normalized}` };
  }
  return applyAndRespond(movieId, tmdbMovie);
}

// Accepts what an admin actually pastes, not just the bare "tt1234567"
// form: a full imdb.com/title/tt.../ link (the natural thing to copy
// from a browser, same as the TMDB links pasted directly in chat when
// this feature was requested), or just the digits with the "tt" prefix
// left off. Returns the normalized "tt..." form findByImdbId expects, or
// null if nothing recognizable was found.
function normalizeImdbId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/imdb\.com\/title\/(tt\d+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^tt\d+$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^\d+$/.test(trimmed)) return `tt${trimmed}`;
  return null;
}

async function applyAndRespond(movieId: string, tmdbMovie: TmdbMovie): Promise<{ ok: boolean; message: string }> {
  const supabase = createServiceRoleClient();

  const { data: movie } = await supabase.from('movies').select('id').eq('id', movieId).maybeSingle();
  if (!movie) {
    return { ok: false, message: 'Movie not found' };
  }

  try {
    await applyTmdbMatch(supabase, movieId, tmdbMovie);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to apply match' };
  }

  revalidatePath('/admin/matching');
  revalidatePath('/browse');

  return { ok: true, message: `Matched to "${tmdbMovie.title}" (${tmdbMovie.release_date || 'no date'}).` };
}

function summarize(job: JobName, body: unknown): string {
  if (!body || typeof body !== 'object') return 'Done.';
  const b = body as Record<string, unknown>;

  if (job === 'poll') return `Checked ${b.checked ?? 0}, notified ${b.notified ?? 0}.`;
  if (job === 'match-movies') {
    const match = b.match as Record<string, unknown> | undefined;
    return `Matched ${match?.matched ?? 0}, ambiguous ${match?.ambiguous ?? 0}, unmatched ${match?.unmatched ?? 0}.`;
  }
  if (job === 'admin-digest') {
    return `${b.issues ?? 0} issue(s). Email ${b.emailSent ? 'sent' : 'not sent'}, push sent to ${b.pushSent ?? 0}.`;
  }
  if (job === 'scrape-scene-delist') {
    const entries = Object.entries(b);
    if (entries.length === 0) return 'Done.';
    return entries
      .map(([branch, stats]) => `${branch}: ${(stats as Record<string, unknown>).delisted ?? 0} delisted`)
      .join(' · ');
  }
  // scrape-scene (one batch) / scrape-vox: { [branch]: { listed/movies, bookable, ... } }
  const entries = Object.entries(b);
  if (entries.length === 0) return 'Done.';
  return entries
    .map(([branch, stats]) => {
      const s = stats as Record<string, unknown>;
      const listed = s.listed ?? s.movies ?? 0;
      const batchSize = s.batchSize as number | undefined;
      const scope = batchSize !== undefined ? ` (batch of ${batchSize})` : '';
      return `${branch}: ${listed} listed${scope}, ${s.bookable ?? 0} bookable`;
    })
    .join(' · ');
}

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

// The job routes this calls are already protected by SYNC_SECRET (the
// same header the external scheduler sends) -- this action does a
// server-to-server fetch with that secret rather than duplicating any
// job logic, so the routes themselves are untouched.
const JOB_ROUTES = {
  'scrape-scene': '/api/scrape-scene',
  'scrape-vox': '/api/scrape-vox',
  poll: '/api/poll',
  'match-movies': '/api/match-movies',
} as const;

type JobName = keyof typeof JOB_ROUTES;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
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

    return { ok: true, message: summarize(job, body) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Request failed' };
  }
}

function summarize(job: JobName, body: unknown): string {
  if (!body || typeof body !== 'object') return 'Done.';
  const b = body as Record<string, unknown>;

  if (job === 'poll') return `Checked ${b.checked ?? 0}, notified ${b.notified ?? 0}.`;
  if (job === 'match-movies') {
    const match = b.match as Record<string, unknown> | undefined;
    return `Matched ${match?.matched ?? 0}, ambiguous ${match?.ambiguous ?? 0}, unmatched ${match?.unmatched ?? 0}.`;
  }
  // scrape-scene / scrape-vox: { [branch]: { listed/movies, bookable, ... } }
  const entries = Object.entries(b);
  if (entries.length === 0) return 'Done.';
  return entries
    .map(([branch, stats]) => {
      const s = stats as Record<string, unknown>;
      const listed = s.listed ?? s.movies ?? 0;
      return `${branch}: ${listed} listed, ${s.bookable ?? 0} bookable`;
    })
    .join(' · ');
}

import type { MetadataRoute } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reelradar.online';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/browse`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${siteUrl}/cinemas`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/signup`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  // A CI build with no repo secrets (a Dependabot PR, or any external
  // contributor's PR before secrets are granted) can't reach Supabase --
  // skip the DB-backed routes instead of failing the whole build. Real
  // production always has both vars set, so this never degrades the live
  // sitemap.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return staticRoutes;
  }

  const supabase = createServiceRoleClient();

  const [{ data: movies }, { data: branches }] = await Promise.all([
    supabase.from('movies').select('id').eq('match_status', 'matched'),
    supabase.from('branches').select('id'),
  ]);

  const movieRoutes: MetadataRoute.Sitemap = (movies ?? []).map((m) => ({
    url: `${siteUrl}/movies/${m.id}`,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const cinemaRoutes: MetadataRoute.Sitemap = (branches ?? []).map((b) => ({
    url: `${siteUrl}/cinemas/${b.id}`,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  return [...staticRoutes, ...movieRoutes, ...cinemaRoutes];
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next 16 defaults local image paths to allowing only an empty query
    // string, which blocks our own same-origin poster proxy
    // (/api/scene-poster?src=...) below -- explicit opt-in needed per path.
    localPatterns: [
      { pathname: '/api/scene-poster' },
      { pathname: '/SceneCinemasLogo.jpg' },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        // elCinema poster fallback -- media is sharded across numbered
        // subdomains (confirmed media0106.elcinema.com on one page; no
        // guarantee that's the only shard in use), so this is a wildcard
        // rather than one hardcoded hostname.
        protocol: 'https',
        hostname: '*.elcinema.com',
        pathname: '/uploads/**',
      },
      {
        // Scene Cinemas poster fallback (last resort, after TMDB and
        // elCinema) -- same-origin per branch, confirmed on both cfc and
        // district5 at this exact path.
        protocol: 'https',
        hostname: 'cfc.scenecinemas.com',
        pathname: '/cdn-nextjs/**',
      },
      {
        protocol: 'https',
        hostname: 'district5.scenecinemas.com',
        pathname: '/cdn-nextjs/**',
      },
      {
        // Every `<branch>.scenecinemas.com/cdn-nextjs/**` poster URL is
        // actually a 302 redirect that lands here -- confirmed live on
        // both branches. Next's image optimizer refuses to follow a
        // redirect to a host outside remotePatterns, which is why this
        // fallback silently 502'd in production (dev mode doesn't hit
        // the same strict check) until this host was added.
        protocol: 'https',
        hostname: 'statics.scenecinemas.com',
        pathname: '/covers/**',
      },
      {
        // Supabase Storage-hosted user avatars.
        protocol: 'https',
        hostname: 'ezckygwfbodsjfhfsseg.supabase.co',
        pathname: '/storage/v1/object/public/avatars/**',
      },
    ],
  },
};

export default nextConfig;

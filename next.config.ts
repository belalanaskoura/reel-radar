import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // iOS Safari's PWA-installability detection is strict about this
        // exact content type -- Vercel's static file serving defaults to
        // application/json, which iOS doesn't reliably recognize as a
        // valid web app manifest, causing "Add to Home Screen" to fall
        // back to a plain bookmark instead of an installed standalone app.
        source: '/manifest.json',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
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
        // elCinema) -- same-origin per branch. Wildcarded across every
        // `<branch>.scenecinemas.com` subdomain rather than one entry per
        // branch, so a future branch (any subdomain of scenecinemas.com,
        // per Phase 0's confirmed URL structure) needs no config change.
        protocol: 'https',
        hostname: '*.scenecinemas.com',
        pathname: '/cdn-nextjs/**',
      },
      {
        // Every `<branch>.scenecinemas.com/cdn-nextjs/**` poster URL is
        // actually a 302 redirect that lands on statics.scenecinemas.com
        // -- confirmed live on both branches. Next's image optimizer
        // refuses to follow a redirect to a host outside remotePatterns,
        // which is why this fallback silently 502'd in production (dev
        // mode doesn't hit the same strict check) until this host was
        // added. Covered by the wildcard above already (statics is also
        // a *.scenecinemas.com subdomain), kept as an explicit second
        // entry only because its path (/covers/**) differs from the
        // per-branch pattern's (/cdn-nextjs/**).
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

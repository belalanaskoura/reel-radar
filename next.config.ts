import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
    ],
  },
};

export default nextConfig;

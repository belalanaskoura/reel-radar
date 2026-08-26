import { NextRequest, NextResponse } from 'next/server';

// Scene Cinemas posters (cfc/district5's cdn-nextjs URLs, which redirect to
// statics.scenecinemas.com) are unreachable by Vercel's Image Optimization
// service specifically: Cloudflare in front of Scene's static host serves
// the image fine to direct requests (confirmed from this dev machine and via
// a local `next start` production build) but Vercel's optimizer consistently
// gets OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED, most likely Cloudflare
// blocking Vercel's IP range. Proxying the fetch through our own server
// (not Vercel's separate image-optimization infra) and serving it same-origin
// sidesteps that entirely.
// Wildcarded to any scenecinemas.com subdomain (rather than one entry per
// known branch) so a future branch's poster host needs no code change --
// mirrors the same *.scenecinemas.com pattern in next.config.ts and
// tmdb-image.ts. Must check for a subdomain boundary, not just a suffix
// match, or "evilscenecinemas.com" would incorrectly pass.
function isAllowedHost(hostname: string): boolean {
  return hostname === 'scenecinemas.com' || hostname.endsWith('.scenecinemas.com');
}

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_REDIRECTS = 3;
const MAX_BYTES = 8 * 1024 * 1024;

function isValidUrl(target: string): URL | null {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' || !isAllowedHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('src');
  if (!target) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  let url = isValidUrl(target);
  if (!url) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 400 });
  }

  // redirect: 'manual' -- each hop is re-validated against the same
  // scenecinemas.com allowlist before being followed, so an open redirect
  // on the upstream host can't be used to turn this into a general SSRF
  // proxy. Capped at MAX_REDIRECTS rather than following indefinitely.
  let upstream: Response;
  for (let hop = 0; ; hop++) {
    upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'manual',
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location');
      if (!location || hop >= MAX_REDIRECTS) {
        return NextResponse.json({ error: 'too many redirects' }, { status: 502 });
      }
      const next = isValidUrl(new URL(location, url).toString());
      if (!next) {
        return NextResponse.json({ error: 'redirect host not allowed' }, { status: 502 });
      }
      url = next;
      continue;
    }
    break;
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'upstream fetch failed' }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'unexpected content type' }, { status: 502 });
  }

  const contentLength = upstream.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: 'image too large' }, { status: 502 });
  }

  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image too large' }, { status: 502 });
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}

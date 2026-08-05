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
const ALLOWED_HOSTS = [
  'cfc.scenecinemas.com',
  'district5.scenecinemas.com',
  'statics.scenecinemas.com',
];

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('src');
  if (!target) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 400 });
  }

  const upstream = await fetch(parsed, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'follow',
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'upstream fetch failed' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}

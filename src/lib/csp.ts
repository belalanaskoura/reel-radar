// Content-Security-Policy, built per request because script-src carries a
// fresh nonce each time.
//
// This app is unusually well placed for a strict policy: no
// dangerouslySetInnerHTML anywhere, no eval, no third-party script tags.
// The one inline script is the theme-flash preventer in layout.tsx, which
// goes through next/script -- Next.js applies the nonce to its own script
// tags automatically when it finds one in the request's CSP header, which
// is why proxy.ts sets the header on the *request* as well as the
// response.
//
// It matters more here than it would elsewhere: the Supabase auth cookie
// cannot be httpOnly (PKCE reads it from JS in GoogleSignInButton), so an
// XSS would hand over the session token itself. CSP is the layer that
// makes that harder to reach.
export function buildCsp(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : '';
  const supabaseWs = supabaseOrigin.replace(/^https:/, 'wss:');
  const isDev = process.env.NODE_ENV !== 'production';

  const directives: string[] = [
    "default-src 'self'",

    // 'strict-dynamic' lets the nonced Next.js bootstrap load the chunks
    // it needs without every chunk URL being listed. Dev additionally
    // needs 'unsafe-eval' for React Refresh; production must not have it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,

    // Nonces on styles are impractical here: Tailwind and next/font both
    // emit inline style, and React sets style attributes directly. This
    // is the one real concession in the policy.
    "style-src 'self' 'unsafe-inline'",

    // next/font/google self-hosts at build time, so fonts come from our
    // own origin -- no fonts.gstatic.com entry needed.
    "font-src 'self' data:",

    // Matches next.config.ts's remotePatterns, plus blob:/data: for the
    // avatar preview before upload.
    [
      "img-src 'self' data: blob:",
      'https://image.tmdb.org',
      'https://*.elcinema.com',
      'https://*.scenecinemas.com',
      supabaseOrigin,
    ]
      .filter(Boolean)
      .join(' '),

    // The browser Supabase client talks to the project origin directly.
    ["connect-src 'self'", supabaseOrigin, supabaseWs].filter(Boolean).join(' '),

    // public/sw.js.
    "worker-src 'self'",
    "manifest-src 'self'",

    // Nothing in this app embeds or is embedded.
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",

    // Stops an injected <base> redirecting every relative URL on the page.
    "base-uri 'self'",

    // Server actions post back to our own origin; nothing should ever
    // submit a form elsewhere.
    "form-action 'self'",
  ];

  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

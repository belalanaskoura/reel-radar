'use client';

// Catches an error thrown by the root layout itself -- src/app/error.tsx
// can't cover this case, since a route's error boundary sits INSIDE the
// root layout it wraps, not around it. This file must render its own
// <html>/<body> (Next.js requirement: it fully replaces the root layout
// when triggered, including its <head>/fonts/providers), so it's
// deliberately minimal rather than reusing layout.tsx's design tokens --
// this is the last line of defense if something in the root layout
// itself throws (the getUser()/push_subscriptions calls there already
// have their own try/catch as of this session, so this is now a backstop
// for whatever's left, not the primary guard).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#0c0f0e',
          color: '#f2f4f3',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '24rem', padding: '0 1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Something went wrong</h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.75, marginBottom: '1.5rem' }}>
            That&apos;s on us, not you. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: '2px',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              background: '#3ddacc',
              color: '#06211d',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

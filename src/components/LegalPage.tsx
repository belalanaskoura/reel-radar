import type { ReactNode } from 'react';

// Shared shell for the three static legal pages (/privacy, /terms,
// /cookies) -- keeps heading scale, prose width, and section spacing
// identical across all three instead of each page re-deriving its own
// typographic scale.
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display mb-2 text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
        {title}
      </h1>
      <p className="mb-10 text-xs tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
        Last updated {updated}
      </p>
      <div className="legal-prose flex flex-col gap-6 text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>
        {children}
      </div>
    </main>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
        {heading}
      </h2>
      <div className="flex flex-col gap-3" style={{ color: 'var(--ink-dim)' }}>
        {children}
      </div>
    </section>
  );
}

import type { ReactNode } from 'react';

// Shared shell for every settings section on /account -- title, one-line
// description, optional corner icon watermark (matches the Alert
// Preferences card's original treatment), consistent border/background.
// Before this, some sections had their own bordered card and others were
// bare controls with a plain text label, which is part of why the page
// read as an unstructured stack rather than a list of distinct settings.
export function SettingsCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-sm border p-5"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      {icon && (
        <div
          className="pointer-events-none absolute top-3 right-3 opacity-[0.07]"
          style={{ color: 'var(--accent)' }}
        >
          {icon}
        </div>
      )}

      <h2
        className="font-display mb-1 text-xl leading-none tracking-wide"
        style={{ color: 'var(--ink)' }}
      >
        {title}
      </h2>
      {description && (
        <p className="mb-5 text-xs" style={{ color: 'var(--ink-dim)' }}>
          {description}
        </p>
      )}

      {children}
    </section>
  );
}

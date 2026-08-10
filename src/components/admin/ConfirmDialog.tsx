'use client';

import { createPortal } from 'react-dom';

export function ConfirmDialog({
  message,
  isPending,
  onConfirm,
  onCancel,
}: {
  message: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Portaled to <body>: rendered inline, this would sit inside
  // PageTransition's animated wrapper (globals.css's .page-transition
  // applies a `transform`), which makes that wrapper a containing block
  // for `position: fixed` descendants -- the overlay would then anchor
  // to that box instead of the viewport and the dialog itself would
  // render off-screen or clipped. A portal escapes that ancestor chain
  // entirely, the same reason PushPrompt is mounted as a layout.tsx
  // sibling of PageTransition rather than inside it.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="dropdown-menu-in absolute inset-0"
        style={{ background: 'color-mix(in srgb, black 55%, transparent)' }}
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        className="dropdown-menu-in relative w-full max-w-sm rounded-sm border p-6"
        style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
      >
        <h2 id="confirm-dialog-title" className="font-display text-2xl leading-none" style={{ color: 'var(--ink)' }}>
          Are you sure?
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          {message}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {isPending ? 'Running…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="text-sm transition-opacity hover:opacity-70 disabled:opacity-60"
            style={{ color: 'var(--ink-dim)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

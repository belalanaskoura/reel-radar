'use client';

import { useState } from 'react';

// Generic confirm/cancel modal, same fixed-overlay dialog shell
// PushPrompt/FeatureAnnouncement already use (backdrop click dismisses,
// same as declining). Kept content-agnostic (title/description/labels
// as props) so it isn't tied to any one confirm flow. The optional
// "don't ask again" checkbox is generic too (any caller can use it),
// not specific to WatchlistGrid's own use of it -- onConfirm/onCancel
// each receive whether it was checked so the caller decides what that
// means for its own flow.
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  dontAskAgainLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dontAskAgainLabel?: string;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: (dontAskAgain: boolean) => void;
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="dropdown-menu-in absolute inset-0"
        style={{ background: 'color-mix(in srgb, black 55%, transparent)' }}
        onClick={() => onCancel(dontAskAgain)}
        aria-hidden="true"
      />
      <div
        className="dropdown-menu-in relative w-full max-w-sm rounded-sm border p-6"
        style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
      >
        <h2 id="confirm-dialog-title" className="font-display text-2xl leading-none" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
        {description && (
          <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
            {description}
          </p>
        )}
        {dontAskAgainLabel && (
          <label className="mt-4 flex items-center gap-2 text-xs" style={{ color: 'var(--ink-dim)' }}>
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            {dontAskAgainLabel}
          </label>
        )}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onConfirm(dontAskAgain)}
            className="rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => onCancel(dontAskAgain)}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--ink-dim)' }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

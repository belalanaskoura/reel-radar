'use client';

import { useEffect, useRef, useState } from 'react';

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
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dontAskAgainRef = useRef(dontAskAgain);

  // Keeps the ref in sync without writing to it during render (refs
  // should only be touched in effects/event handlers) -- read by the
  // Escape handler below via closure so a later keypress sees the
  // checkbox's current value without re-running the mount-focus effect
  // (and re-stealing focus) every time the checkbox changes.
  useEffect(() => {
    dontAskAgainRef.current = dontAskAgain;
  }, [dontAskAgain]);

  // Moves keyboard focus into the dialog on mount (it otherwise stays on
  // whatever triggered the dialog, now hidden behind the overlay) and
  // lets Escape cancel, matching the backdrop-click behavior that already
  // exists -- neither was wired up before, so a keyboard-only user had no
  // way to dismiss this short of tabbing to the Cancel button blind.
  useEffect(() => {
    confirmButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel(dontAskAgainRef.current);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

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
            ref={confirmButtonRef}
            type="button"
            onClick={() => onConfirm(dontAskAgain)}
            className="rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => onCancel(dontAskAgain)}
            className="text-sm transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2"
            style={{ color: 'var(--ink-dim)' }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';

// Just the password-change form now -- the collapse/expand chrome this
// component used to own itself (a "Settings" link that revealed its own
// separate bordered card) moved to SettingsCard, so every section on
// /account/edit collapses the same way instead of Security looking and
// behaving differently from Notifications/Appearance next to it.
export function SecurityPanel({
  updatePassword,
}: {
  updatePassword: (formData: FormData) => Promise<void>;
}) {
  const [mismatch, setMismatch] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const newPassword = (form.elements.namedItem('new_password') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirm_password') as HTMLInputElement).value;

    if (newPassword !== confirmPassword) {
      e.preventDefault();
      setMismatch(true);
      return;
    }
    setMismatch(false);
  }

  return (
    <form action={updatePassword} onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="new_password" className="text-xs font-medium" style={{ color: 'var(--ink-dim)' }}>
          NEW PASSWORD
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Enter new password"
          className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirm_password" className="text-xs font-medium" style={{ color: 'var(--ink-dim)' }}>
          CONFIRM PASSWORD
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Repeat new password"
          onChange={() => setMismatch(false)}
          className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
        />
      </div>
      {mismatch && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          Passwords don&apos;t match.
        </p>
      )}
      <button
        type="submit"
        className="rounded-sm py-2 text-xs font-semibold tracking-wide transition-opacity hover:opacity-90"
        style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
      >
        UPDATE PASSWORD
      </button>
    </form>
  );
}

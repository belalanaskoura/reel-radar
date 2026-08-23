'use client';

import { useState } from 'react';

// Same shape as SecurityPanel.tsx's form (client-side mismatch check
// before submit) but kept as this page's own component rather than
// reusing SecurityPanel directly -- this page needs a different submit
// button label and has no other settings around it to share chrome
// with.
export function ResetPasswordForm({
  resetPassword,
}: {
  resetPassword: (formData: FormData) => Promise<void>;
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
    <form action={resetPassword} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="new_password" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          New password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirm_password" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Confirm password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          onChange={() => setMismatch(false)}
          className="rounded-sm border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
        />
      </div>
      {mismatch && (
        <p className="text-sm" style={{ color: 'var(--error-ink)' }}>
          Passwords don&apos;t match.
        </p>
      )}
      <button
        type="submit"
        className="rounded-sm px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        Set new password
      </button>
    </form>
  );
}

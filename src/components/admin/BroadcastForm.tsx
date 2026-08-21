'use client';

import { useState, useTransition } from 'react';
import { sendBroadcast } from '@/app/admin/broadcast/actions';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

const DEFAULT_SUBJECT = 'Thank you for using ReelRadar';
const DEFAULT_MESSAGE = `Hi there,

We just wanted to take a moment to say thank you for using ReelRadar. Having you here means a lot, and your support is what keeps this project going.

We're always working to make ReelRadar better for you — faster showtime updates, more cinemas, and a smoother experience overall. If there's ever anything you'd like to see improved, we'd love to hear from you.

Thanks again for being part of this.

— The ReelRadar team`;

export function BroadcastForm({ recipientCount }: { recipientCount: number }) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setResult(null);
    startTransition(async () => {
      const outcome = await sendBroadcast(subject, message);
      setResult(outcome);
      setShowConfirm(false);
    });
  }

  const canSend = subject.trim().length > 0 && message.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="broadcast-subject"
            className="mb-1.5 block text-[11px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--ink-dim)' }}
          >
            Subject
          </label>
          <input
            id="broadcast-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-sm border-b-2 px-4 py-3 text-sm focus:outline-none"
            style={{ background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--rule)' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
          />
        </div>

        <div>
          <label
            htmlFor="broadcast-message"
            className="mb-1.5 block text-[11px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--ink-dim)' }}
          >
            Message
          </label>
          <textarea
            id="broadcast-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            className="w-full resize-y rounded-sm border-b-2 px-4 py-4 text-sm leading-relaxed focus:outline-none"
            style={{ background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--rule)' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
          />
        </div>
      </div>

      {/* Push notifications only carry a short title/body, unlike email's
          full subject+message -- shown as a distinct preview so it's clear
          this isn't literally what push subscribers will see, just the
          same content reaching them through a much smaller window. */}
      <div className="rounded-sm border p-4" style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}>
        <p className="mb-2 text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Preview
        </p>
        <div className="rounded-sm border p-3" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {subject || '(no subject)'}
          </p>
          <p className="mt-1.5 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-dim)' }}>
            {message || '(no message)'}
          </p>
        </div>
      </div>

      {result && (
        <p
          role="status"
          className="rounded-sm px-4 py-2.5 text-sm"
          style={{
            background: result.ok ? 'var(--ok-bg)' : 'var(--error-bg)',
            color: result.ok ? 'var(--ok-ink)' : 'var(--error-ink)',
          }}
        >
          {result.message}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={!canSend || isPending}
        className="self-start rounded-sm px-5 py-3 text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        {isPending ? 'Sending…' : `Send to ${recipientCount} user${recipientCount === 1 ? '' : 's'}`}
      </button>

      {showConfirm && (
        <ConfirmDialog
          message={`This sends a real email (and push, where subscribed) to all ${recipientCount} signed-up users right now. This can't be undone once sent.`}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

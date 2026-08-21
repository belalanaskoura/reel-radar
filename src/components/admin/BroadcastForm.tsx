'use client';

import { useState, useTransition } from 'react';
import { sendBroadcast, type BroadcastResult } from '@/app/admin/broadcast/actions';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { StatTile } from '@/components/admin/StatTile';
import { CheckIcon } from '@/components/icons';

export function BroadcastForm({ recipientCount }: { recipientCount: number }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
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
            placeholder="e.g. New cinema now on ReelRadar"
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
            placeholder="Write what you want to send to every user here..."
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

      {result && <BroadcastResultPanel result={result} />}

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

// A genuine send-time failure (couldn't list users, action rejected) is
// rare and worth a real error banner. A per-user email/push failure is
// not that -- it's routine and expected (bounced address, expired push
// subscription), so it's shown as calm stats instead of stacking a red
// "X failed" clause onto an otherwise-successful send, which previously
// made an 18/20-delivered broadcast read as if the whole thing errored.
function BroadcastResultPanel({ result }: { result: BroadcastResult }) {
  if (!result.ok) {
    return (
      <p
        role="alert"
        className="rounded-sm px-4 py-2.5 text-sm"
        style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}
      >
        {result.error}
      </p>
    );
  }

  const pushSkipped = result.recipientCount - result.pushSent;

  return (
    <div role="status" className="flex flex-col gap-3 rounded-sm border p-4" style={{ borderColor: 'var(--rule)' }}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)' }}
        >
          <CheckIcon size={13} />
        </span>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Broadcast sent
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Recipients" value={result.recipientCount} />
        <StatTile
          label="Email delivered"
          value={result.emailSent}
          tone={result.emailFailed > 0 ? 'error' : 'ok'}
          sublabel={result.emailFailed > 0 ? `${result.emailFailed} didn't go through` : undefined}
        />
        <StatTile
          label="Push delivered"
          value={result.pushSent}
          tone="neutral"
          sublabel={pushSkipped > 0 ? `${pushSkipped} not subscribed` : undefined}
        />
      </div>
    </div>
  );
}

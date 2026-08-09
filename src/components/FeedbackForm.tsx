'use client';

import { useState, useTransition } from 'react';
import { CheckIcon, MailIcon, SendIcon } from '@/components/icons';
import { submitFeedback } from '@/app/feedback/actions';

const MAX_MESSAGE_LENGTH = 4000;

export function FeedbackForm({ email }: { email: string }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitFeedback(message);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'var(--ok-bg)' }}
        >
          <CheckIcon size={28} style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="font-display text-2xl leading-none tracking-wide" style={{ color: 'var(--ink)' }}>
          MESSAGE SENT
        </h2>
        <p className="max-w-[80%] text-sm" style={{ color: 'var(--ink-dim)' }}>
          Thanks for reaching out — feedback like this is what makes ReelRadar better.
        </p>
        <button
          type="button"
          onClick={() => {
            setMessage('');
            setSent(false);
          }}
          className="mt-2 text-xs font-semibold tracking-widest uppercase transition-opacity hover:opacity-70"
          style={{ color: 'var(--accent-dim)' }}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div
        className="flex items-center gap-3 rounded-sm p-3"
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <MailIcon size={15} style={{ color: 'var(--ink-dim)' }} />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
            Sending as
          </span>
          <span className="truncate text-sm" style={{ color: 'var(--ink)' }}>
            {email}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-sm px-4 py-2.5 text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        rows={6}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="What's on your mind?"
        aria-label="Your message"
        className="w-full resize-none rounded-sm border-b-2 px-4 py-4 text-sm focus:outline-none"
        style={{ background: 'var(--surface)', color: 'var(--ink)', borderColor: 'transparent' }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
      />

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-sm py-4 text-xs font-semibold tracking-widest uppercase transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        {isPending ? 'Sending…' : 'Send feedback'}
        {!isPending && <SendIcon size={16} />}
      </button>
    </form>
  );
}

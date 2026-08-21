'use client';

import { useMemo, useState, useTransition } from 'react';
import { sendBroadcast, type BroadcastChannel, type BroadcastResult } from '@/app/admin/broadcast/actions';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { StatTile } from '@/components/admin/StatTile';
import { CheckIcon, SearchIcon, BellIcon } from '@/components/icons';

export interface BroadcastUser {
  id: string;
  email: string;
  hasPush: boolean;
}

type RecipientMode = 'all' | 'specific';

const CHANNEL_OPTIONS: { value: BroadcastChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
];

// Two columns on desktop -- compose on the left, a sticky preview/send
// panel on the right, the standard email-campaign-tool layout -- instead
// of one long vertical stack (channels, recipients, subject, message,
// preview, result, send button all stacked top to bottom, which meant
// scrolling past everything just to find the send button again after
// writing a long message). Collapses to a single column below lg, where
// there isn't room for two real columns anyway.
export function BroadcastForm({ users }: { users: BroadcastUser[] }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<Set<BroadcastChannel>>(new Set(['email', 'push']));
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [userFilter, setUserFilter] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleChannel(channel: BroadcastChannel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, userFilter]);

  function toggleUser(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function switchMode(mode: RecipientMode) {
    setRecipientMode(mode);
    setResult(null);
  }

  function handleConfirm() {
    setResult(null);
    startTransition(async () => {
      const outcome = await sendBroadcast(
        subject,
        message,
        recipientMode === 'specific' ? [...selectedIds] : undefined,
        [...channels],
      );
      setResult(outcome);
      setShowConfirm(false);
    });
  }

  const recipientCount = recipientMode === 'all' ? users.length : selectedIds.size;
  const canSend =
    subject.trim().length > 0 && message.trim().length > 0 && recipientCount > 0 && channels.size > 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <p className="mb-1.5 text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
              Channels
            </p>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((opt) => {
                const active = channels.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleChannel(opt.value)}
                    aria-pressed={active}
                    className="min-h-[36px] rounded-full border px-4 py-2 text-xs font-semibold transition-colors"
                    style={
                      active
                        ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
                        : { color: 'var(--ink-dim)', borderColor: 'var(--rule)' }
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1">
            <p className="mb-1.5 text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
              Recipients
            </p>
            <div className="flex w-fit rounded-sm border text-xs font-semibold" style={{ borderColor: 'var(--rule)' }}>
              <button
                type="button"
                onClick={() => switchMode('all')}
                className="min-h-[36px] rounded-l-sm px-4 py-2 transition-opacity"
                style={
                  recipientMode === 'all'
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                    : { color: 'var(--ink-dim)' }
                }
              >
                All users
              </button>
              <button
                type="button"
                onClick={() => switchMode('specific')}
                className="min-h-[36px] rounded-r-sm px-4 py-2 transition-opacity"
                style={
                  recipientMode === 'specific'
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                    : { color: 'var(--ink-dim)' }
                }
              >
                Specific users
              </button>
            </div>
          </div>
        </div>

        {recipientMode === 'specific' && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                style={{ color: 'var(--ink-dim)' }}
              />
              <input
                type="text"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="Filter by email..."
                className="w-full rounded-sm border py-2 pr-3 pl-9 text-sm focus:outline-none"
                style={{ borderColor: 'var(--rule)', background: 'var(--surface)', color: 'var(--ink)' }}
              />
            </div>

            <div
              className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md p-2"
              style={{ background: 'var(--bg-elevated)' }}
            >
              {filteredUsers.length === 0 ? (
                <p className="px-2 py-3 text-xs" style={{ color: 'var(--ink-dim)' }}>
                  No users match &ldquo;{userFilter}&rdquo;.
                </p>
              ) : (
                filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm"
                    style={{ color: 'var(--ink)' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{u.email}</span>
                    {u.hasPush && (
                      <span title="Push enabled" style={{ color: 'var(--accent-dim)' }}>
                        <BellIcon size={13} />
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>

            <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              {selectedIds.size} selected
            </p>
          </div>
        )}

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
            rows={12}
            placeholder="Write what you want to send..."
            className="w-full resize-y rounded-sm border-b-2 px-4 py-4 text-sm leading-relaxed focus:outline-none"
            style={{ background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--rule)' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        {/* Push notifications only carry a short title/body, unlike email's
            full subject+message -- shown as a distinct preview so it's
            clear this isn't literally what push subscribers will see,
            just the same content reaching them through a much smaller
            window. */}
        <div className="rounded-md p-4" style={{ background: 'var(--bg-elevated)' }}>
          <p className="mb-2 text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
            Preview
          </p>
          <div className="rounded-sm p-3" style={{ background: 'var(--surface)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {subject || '(no subject)'}
            </p>
            <p className="mt-1.5 text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-dim)' }}>
              {message || '(no message)'}
            </p>
          </div>
        </div>

        <div className="rounded-md p-4" style={{ background: 'var(--bg-elevated)' }}>
          <p className="mb-3 text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
            Summary
          </p>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--ink-dim)' }}>Channels</dt>
              <dd style={{ color: 'var(--ink)' }}>{channels.size === 0 ? 'None picked' : [...channels].map((c) => (c === 'email' ? 'Email' : 'Push')).join(' + ')}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: 'var(--ink-dim)' }}>Recipients</dt>
              <dd style={{ color: 'var(--ink)' }}>
                {recipientCount} {recipientMode === 'all' ? '(everyone)' : '(selected)'}
              </dd>
            </div>
          </dl>
        </div>

        {result && <BroadcastResultPanel result={result} />}

        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={!canSend || isPending}
          className="w-full rounded-sm px-5 py-3 text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {isPending ? 'Sending…' : `Send to ${recipientCount} user${recipientCount === 1 ? '' : 's'}`}
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          message={`This sends a real ${channelSummary(channels)} to ${
            recipientMode === 'all' ? `all ${recipientCount} signed-up users` : `the ${recipientCount} selected user${recipientCount === 1 ? '' : 's'}`
          } right now. This can't be undone once sent.`}
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
  const sentEmail = result.channelsSent.includes('email');
  const sentPush = result.channelsSent.includes('push');

  return (
    <div role="status" className="flex flex-col gap-3 rounded-md p-4" style={{ background: 'var(--bg-elevated)' }}>
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

      <div className="flex flex-col gap-2">
        <StatTile label="Recipients" value={result.recipientCount} />
        {sentEmail && (
          <StatTile
            label="Email delivered"
            value={result.emailSent}
            tone={result.emailFailed > 0 ? 'error' : 'ok'}
            sublabel={result.emailFailed > 0 ? `${result.emailFailed} didn't go through` : undefined}
          />
        )}
        {sentPush && (
          <StatTile
            label="Push delivered"
            value={result.pushSent}
            tone="neutral"
            sublabel={pushSkipped > 0 ? `${pushSkipped} not subscribed` : undefined}
          />
        )}
      </div>
    </div>
  );
}

function channelSummary(channels: Set<BroadcastChannel>): string {
  if (channels.has('email') && channels.has('push')) return 'email and push notification (where subscribed)';
  if (channels.has('push')) return 'push notification (to whoever is subscribed)';
  return 'email';
}

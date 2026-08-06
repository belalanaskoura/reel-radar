'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveNtfyTopic } from '@/app/account/actions';
import { BellIcon } from '@/components/icons';

const STEPS = ['Install', 'Name it', 'Connect', 'Done'] as const;
const RANDOM_SUFFIX_LENGTH = 4;

function randomTopic() {
  const suffix = Math.random().toString(36).slice(2, 2 + RANDOM_SUFFIX_LENGTH);
  return `reelradar-${suffix}`;
}

export function NtfyOnboarding({ initialTopic }: { initialTopic: string | null }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [topic, setTopic] = useState(initialTopic ?? '');
  const [suggested, setSuggested] = useState(randomTopic);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function goTo(next: number) {
    setDirection(next > step ? 'forward' : 'back');
    setStep(next);
  }

  function handleSaveTopic() {
    if (isPending) return;
    const usedSuggested = !topic.trim();
    const value = topic.trim() || suggested;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveNtfyTopic(value);
        if (result.error) {
          setError(result.error);
          // The suggested topic that just collided is a dead end on
          // retry (it'll just collide again), so mint a fresh one. Only
          // when the user was actually relying on it, not when they
          // typed something themselves.
          if (usedSuggested) setSuggested(randomTopic());
          return;
        }
        setTopic(value);
        goTo(2);
      } catch {
        setError('Something went wrong saving that topic. Please try again.');
      }
    });
  }

  return (
    <div>
      <ol className="mb-8 flex items-center justify-center gap-2" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && goTo(i)}
              aria-current={i === step ? 'step' : undefined}
              className="flex h-2.5 w-2.5 rounded-full transition-[transform,background-color] duration-200 disabled:cursor-default"
              style={{
                background: i <= step ? 'var(--accent)' : 'var(--rule)',
                transform: i === step ? 'scale(1.6)' : 'scale(1)',
              }}
            >
              <span className="sr-only">
                Step {i + 1}: {label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="h-px w-4 sm:w-8"
                style={{ background: i < step ? 'var(--accent)' : 'var(--rule)' }}
              />
            )}
          </li>
        ))}
      </ol>

      <div
        key={step}
        className={`mx-auto max-w-md ${direction === 'forward' ? 'step-in-forward' : 'step-in-back'}`}
      >
        {step === 0 && <InstallStep onNext={() => goTo(1)} />}
        {step === 1 && (
          <NameStep
            topic={topic}
            suggested={suggested}
            error={error}
            isPending={isPending}
            onChange={(v) => {
              setTopic(v);
              setError(null);
            }}
            onSave={handleSaveTopic}
            onBack={() => goTo(0)}
          />
        )}
        {step === 2 && <ConnectStep topic={topic || suggested} onNext={() => goTo(3)} onBack={() => goTo(1)} />}
        {step === 3 && <DoneStep />}
      </div>

      <p className="mt-8 text-center text-sm" style={{ color: 'var(--ink-dim)' }}>
        <Link href="/browse" className="underline" style={{ color: 'var(--accent)' }}>
          Skip for now
        </Link>{' '}
        &mdash; you can always finish this later from your profile.
      </p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-sm border p-6 text-center sm:p-8"
      style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
    >
      {children}
    </div>
  );
}

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
      style={{ background: 'var(--ok-bg)', color: 'var(--accent)' }}
    >
      {children}
    </div>
  );
}

function NextButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
    >
      {children}
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 w-full text-center text-xs underline"
      style={{ color: 'var(--ink-dim)' }}
    >
      Back
    </button>
  );
}

function InstallStep({ onNext }: { onNext: () => void }) {
  return (
    <Card>
      <StepIcon>
        <DownloadIcon />
      </StepIcon>
      <h2 className="font-display mb-2 text-3xl leading-none" style={{ color: 'var(--ink)' }}>
        Install ntfy
      </h2>
      <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
        A free app that receives the push. No account or login inside it.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <a
          href="https://play.google.com/store/apps/details?id=io.heckel.ntfy"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
        >
          Get it on Play Store
        </a>
        <a
          href="https://apps.apple.com/us/app/ntfy/id1625396347"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
        >
          Get it on App Store
        </a>
      </div>
      <NextButton onClick={onNext}>I&apos;ve installed it &rarr;</NextButton>
    </Card>
  );
}

function NameStep({
  topic,
  suggested,
  error,
  isPending,
  onChange,
  onSave,
  onBack,
}: {
  topic: string;
  suggested: string;
  error: string | null;
  isPending: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <StepIcon>
        <TagIcon />
      </StepIcon>
      <h2 className="font-display mb-2 text-3xl leading-none" style={{ color: 'var(--ink)' }}>
        Name your topic
      </h2>
      <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
        A topic is a private channel name. Anyone who knows it can send to it,
        so keep it unguessable.
      </p>

      <div className="mt-5 text-left">
        <input
          type="text"
          value={topic}
          onChange={(e) => onChange(e.target.value)}
          placeholder={suggested}
          aria-label="Your ntfy topic"
          className="w-full rounded-sm border px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2"
          style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--ink)' }}
        />
        <button
          type="button"
          onClick={() => onChange(suggested)}
          className="mt-1.5 text-xs underline"
          style={{ color: 'var(--accent)' }}
        >
          Use suggested: {suggested}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-sm px-3 py-2 text-left text-xs" style={{ background: 'var(--error-bg)', color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}

      <NextButton onClick={onSave} disabled={isPending}>
        {isPending ? 'Saving...' : 'Save & continue →'}
      </NextButton>
      <BackLink onClick={onBack} />
    </Card>
  );
}

function ConnectStep({ topic, onNext, onBack }: { topic: string; onNext: () => void; onBack: () => void }) {
  return (
    <Card>
      <StepIcon>
        <LinkIcon />
      </StepIcon>
      <h2 className="font-display mb-2 text-3xl leading-none" style={{ color: 'var(--ink)' }}>
        Connect the app
      </h2>
      <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
        Open ntfy, tap <strong>+</strong>, and enter this exact name:
      </p>
      <p
        className="mt-3 rounded-sm border px-3 py-2.5 text-sm font-medium"
        style={{ borderColor: 'var(--rule)', background: 'var(--bg)', color: 'var(--accent)', fontFamily: 'monospace' }}
      >
        {topic}
      </p>
      <p className="mt-3 text-xs" style={{ color: 'var(--ink-dim)' }}>
        That&apos;s the whole connection. No login, no pairing code.
      </p>

      <NextButton onClick={onNext}>Done, I&apos;ve added it &rarr;</NextButton>
      <BackLink onClick={onBack} />
    </Card>
  );
}

function DoneStep() {
  return (
    <Card>
      <StepIcon>
        <BellIcon />
      </StepIcon>
      <h2 className="font-display mb-2 text-3xl leading-none" style={{ color: 'var(--ink)' }}>
        You&apos;re set
      </h2>
      <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
        Watchlist a movie and ReelRadar will push a notification the moment
        it&apos;s bookable at Cairo Festival City or District 5, with a link
        straight to booking.
      </p>
      <Link
        href="/browse"
        className="mt-6 inline-block w-full rounded-sm px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        Browse movies &rarr;
      </Link>
    </Card>
  );
}

function iconProps() {
  return {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function DownloadIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M20 10l-9.5 9.5a1.5 1.5 0 0 1-2 0L3 14V4h10z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M9 15l6-6" />
      <path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1" />
      <path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1" />
    </svg>
  );
}

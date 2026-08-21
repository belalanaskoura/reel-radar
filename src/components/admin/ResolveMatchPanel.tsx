'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { fetchCandidatesForMovie, resolveMovieMatch, resolveMovieMatchByImdbId } from '@/app/admin/actions';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { posterUrl } from '@/lib/tmdb-image';

type TmdbMovie = NonNullable<Awaited<ReturnType<typeof fetchCandidatesForMovie>>['candidates']>[number];
type IdSearchMode = 'tmdb' | 'imdb';

// Per-row resolve UI for the admin matching backlog: fetches live TMDB
// candidates on demand (not on page load -- see admin/matching's own
// comment on why) when the admin clicks "Resolve," lets them pick the
// correct one, or fall back to a manual TMDB/IMDb id search when none of
// the candidates are right (the same situation a direct TMDB or IMDb
// link would resolve). The manual id section is its own collapsible,
// closed by default, so the primary candidate-grid path stays the focus
// and this doesn't get crowded on a phone screen.
export function ResolveMatchPanel({ movieId }: { movieId: string }) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [candidates, setCandidates] = useState<TmdbMovie[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<{ tmdbId?: number; imdbId?: string; label: string } | null>(
    null,
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [idSearchOpen, setIdSearchOpen] = useState(false);
  const [idSearchMode, setIdSearchMode] = useState<IdSearchMode>('tmdb');
  const [manualTmdbId, setManualTmdbId] = useState('');
  const [manualImdbId, setManualImdbId] = useState('');

  function handleExpand() {
    setExpanded(true);
    setResult(null);
    if (candidates !== null) return;
    startTransition(async () => {
      const outcome = await fetchCandidatesForMovie(movieId);
      if (!outcome.ok) {
        setLoadError(outcome.message ?? 'Failed to load candidates');
        return;
      }
      setCandidates(outcome.candidates ?? []);
    });
  }

  function handleApply() {
    if (!pendingChoice) return;
    setResult(null);
    startTransition(async () => {
      const outcome =
        pendingChoice.tmdbId !== undefined
          ? await resolveMovieMatch(movieId, pendingChoice.tmdbId)
          : await resolveMovieMatchByImdbId(movieId, pendingChoice.imdbId!);
      setResult(outcome);
      setPendingChoice(null);
      if (outcome.ok) {
        setExpanded(false);
        setCandidates(null);
        setIdSearchOpen(false);
      }
    });
  }

  if (!expanded) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleExpand}
          className="w-fit min-h-[36px] rounded-sm border px-3 py-1.5 text-xs font-semibold tracking-wide transition-opacity hover:opacity-80"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Resolve
        </button>
        {result && (
          <p className="text-xs" style={{ color: result.ok ? 'var(--ok-ink)' : 'var(--error-ink)' }}>
            {result.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex w-full flex-col gap-3 rounded-sm border p-3"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--ink-dim)' }}>
          Pick the correct match
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="min-h-[32px] text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--ink-dim)' }}
        >
          Cancel
        </button>
      </div>

      {isPending && candidates === null && (
        <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
          Searching TMDB…
        </p>
      )}

      {loadError && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {loadError}
        </p>
      )}

      {candidates && candidates.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
          No TMDB search results for this title.
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <div className="grid grid-cols-2 gap-2 xs:grid-cols-3 sm:grid-cols-4">
          {candidates.map((c) => {
            const poster = posterUrl(c.poster_path, 'w200');
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setPendingChoice({ tmdbId: c.id, label: c.title })}
                disabled={isPending}
                className="flex flex-col gap-1 rounded-sm border p-2 text-left transition-opacity hover:opacity-80 disabled:opacity-60"
                style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)' }}
              >
                <div
                  className="relative aspect-[2/3] w-full overflow-hidden rounded-sm"
                  style={{ background: 'var(--listed-bg)' }}
                >
                  {poster ? (
                    <Image src={poster} alt={c.title} fill sizes="(max-width: 390px) 45vw, 120px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-[10px]" style={{ color: 'var(--ink-dim)' }}>
                      No poster
                    </div>
                  )}
                </div>
                <span className="line-clamp-2 text-xs font-medium" style={{ color: 'var(--ink)' }}>
                  {c.title}
                </span>
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                  {c.release_date ? c.release_date.slice(0, 4) : 'no date'} &middot; id {c.id}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
        <button
          type="button"
          onClick={() => setIdSearchOpen((v) => !v)}
          className="flex min-h-[36px] w-full items-center justify-between gap-2 text-xs font-medium"
          style={{ color: 'var(--ink-dim)' }}
          aria-expanded={idSearchOpen}
        >
          <span>None of these right? Search by TMDB or IMDb id</span>
          <span aria-hidden="true" style={{ transform: idSearchOpen ? 'rotate(180deg)' : 'none' }} className="transition-transform">
            ▾
          </span>
        </button>

        {idSearchOpen && (
          <div className="mt-2 flex flex-col gap-2.5">
            <div className="flex w-fit rounded-sm border text-xs font-semibold" style={{ borderColor: 'var(--rule)' }}>
              <button
                type="button"
                onClick={() => {
                  setIdSearchMode('tmdb');
                  setResult(null);
                }}
                className="min-h-[32px] rounded-l-sm px-3 py-1.5 transition-opacity"
                style={
                  idSearchMode === 'tmdb'
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                    : { color: 'var(--ink-dim)' }
                }
              >
                TMDB id
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdSearchMode('imdb');
                  setResult(null);
                }}
                className="min-h-[32px] rounded-r-sm px-3 py-1.5 transition-opacity"
                style={
                  idSearchMode === 'imdb'
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                    : { color: 'var(--ink-dim)' }
                }
              >
                IMDb id
              </button>
            </div>

            {idSearchMode === 'tmdb' ? (
              <div className="flex flex-col gap-1.5 xs:flex-row xs:items-center xs:gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={manualTmdbId}
                  onChange={(e) => {
                    setManualTmdbId(e.target.value);
                    setResult(null);
                  }}
                  placeholder="e.g. 1232569"
                  className="min-h-[36px] w-full rounded-sm border px-2 py-1.5 text-xs xs:w-32"
                  style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const id = Number(manualTmdbId.trim());
                    if (Number.isFinite(id) && id > 0) {
                      setPendingChoice({ tmdbId: id, label: `TMDB id ${id}` });
                    }
                  }}
                  disabled={isPending || !manualTmdbId.trim()}
                  className="min-h-[36px] w-full rounded-sm border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-60 xs:w-auto"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Use this id
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 xs:flex-row xs:items-center xs:gap-2">
                <input
                  type="text"
                  value={manualImdbId}
                  onChange={(e) => {
                    setManualImdbId(e.target.value);
                    setResult(null);
                  }}
                  placeholder="tt1232569 or an imdb.com link"
                  className="min-h-[36px] w-full rounded-sm border px-2 py-1.5 text-xs xs:w-48"
                  style={{ borderColor: 'var(--rule)', background: 'var(--bg-elevated)', color: 'var(--ink)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const id = manualImdbId.trim();
                    if (id) setPendingChoice({ imdbId: id, label: `IMDb id ${id}` });
                  }}
                  disabled={isPending || !manualImdbId.trim()}
                  className="min-h-[36px] w-full rounded-sm border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-60 xs:w-auto"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Use this id
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {result && !result.ok && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {result.message}
        </p>
      )}

      {pendingChoice && (
        <ConfirmDialog
          message={`Match this movie to "${pendingChoice.label}"? This updates the row immediately.`}
          isPending={isPending}
          onConfirm={handleApply}
          onCancel={() => setPendingChoice(null)}
        />
      )}
    </div>
  );
}

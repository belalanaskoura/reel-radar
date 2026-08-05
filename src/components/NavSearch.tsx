'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchIcon } from '@/components/icons';

// Renders only on the browse page -- search only does something there
// (BrowseGrid reads the same ?q= param), so showing it elsewhere would
// be a dead control. Syncs to the URL rather than local state so it and
// BrowseGrid, which aren't in a direct parent/child relationship, share
// one source of truth without lifting state up through the layout.
export function NavSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (pathname !== '/browse') return null;

  const query = searchParams.get('q') ?? '';

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }
    // A new search always starts back at page 1 -- otherwise a query
    // typed while on page 3 of the old result set would land on page 3
    // of the new one instead.
    params.delete('page');
    router.replace(params.size > 0 ? `/browse?${params}` : '/browse', { scroll: false });
  }

  return (
    <div className="relative order-3 w-full sm:order-none sm:w-auto sm:max-w-sm sm:flex-1">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        style={{ color: 'var(--ink-dim)' }}
      />
      <input
        type="search"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search movies..."
        aria-label="Search movies"
        className="w-full min-w-0 rounded-sm border py-1.5 pr-3 pl-8 text-sm focus:outline-none focus-visible:ring-2"
        style={{
          borderColor: 'var(--rule)',
          background: 'var(--bg-elevated)',
          color: 'var(--ink)',
        }}
      />
    </div>
  );
}
